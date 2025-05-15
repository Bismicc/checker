const express = require("express");
const fetch = require("node-fetch");
const crypto = require("crypto");
const app = express();

// Secret key for token signing - store this in environment variables
const JWT_SECRET = process.env.JWT_SECRET || "your-strong-secret-key";

// In-memory store for tracking valid orders (use a database in production)
const validOrders = new Map();

// In-memory store for IPs and the routes they have accessed
const ipRouteTracker = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add CORS middleware
app.use((req, res, next) => {
  // Allow requests from any origin
  res.header("Access-Control-Allow-Origin", "*");
  
  // Allow specific HTTP methods
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  
  // Allow specific headers
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  
  next();
});

// Middleware to track whether a webhook should be sent
app.use((req, res, next) => {
  const clientIp = req.ip;
  const routeName = req.path.slice(1);

  if (!ipRouteTracker[clientIp]) {
    ipRouteTracker[clientIp] = {};
  }

  if (ipRouteTracker[clientIp][routeName]) {
    res.locals.messageSent = true;
  } else {
    ipRouteTracker[clientIp][routeName] = true;
    res.locals.messageSent = false;
  }

  next();
});

// Create an order verification token
app.post("/create-order", (req, res) => {
  // Extract order information from request body
  const { 
    firstName, lastName, email, street, apartment, 
    city, state, postal, country, phone, orderAmount 
  } = req.body;
  
  // Validate required fields
  if (!email || !orderAmount) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing required order information" 
    });
  }

  // Create a unique order ID
  const orderId = crypto.randomUUID();
  
  // Create timestamp for token expiration
  const timestamp = Date.now();
  const expiresAt = timestamp + (30 * 60 * 1000); // 30 minutes
  
  // Create an order token with HMAC
  const dataToSign = `${orderId}:${email}:${orderAmount}:${timestamp}`;
  const orderToken = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(dataToSign)
    .digest("hex");
  
  // Store valid order information
  validOrders.set(orderId, {
    token: orderToken,
    email,
    orderAmount,
    timestamp,
    expiresAt,
    orderDetails: {
      firstName, lastName, email, street, apartment,
      city, state, postal, country, phone
    },
    paymentCompleted: false
  });
  
  // Return the order ID and token to the client
  res.json({
    success: true,
    orderId,
    orderToken,
    expiresAt
  });
});

// Endpoint for payment gateway to confirm payment
app.post("/payment-webhook", (req, res) => {
  const { orderId, orderToken, paymentDetails } = req.body;
  
  // Validate payment information
  if (!orderId || !orderToken) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing payment confirmation details" 
    });
  }
  
  // Check if order exists and token is valid
  const orderInfo = validOrders.get(orderId);
  if (!orderInfo || orderInfo.token !== orderToken) {
    return res.status(403).json({
      success: false,
      message: "Invalid order information"
    });
  }
  
  // Check if order token is expired
  if (Date.now() > orderInfo.expiresAt) {
    return res.status(403).json({
      success: false,
      message: "Order token expired"
    });
  }
  
  // Mark payment as completed
  orderInfo.paymentCompleted = true;
  orderInfo.paymentDetails = paymentDetails;
  
  // Respond to payment gateway
  res.json({
    success: true,
    message: "Payment confirmed"
  });
});

// Success page route with verification
app.get("/success/:orderId/:token", (req, res) => {
  const { orderId, token } = req.params;
  const clientIp = req.ip;
  
  // Check if order exists and token is valid
  const orderInfo = validOrders.get(orderId);
  if (!orderInfo || orderInfo.token !== token) {
    return res.status(403).send("Invalid order information");
  }
  
  // Check if order token is expired
  if (Date.now() > orderInfo.expiresAt) {
    return res.status(403).send("Order token expired");
  }
  
  // Check if payment has been completed
  if (!orderInfo.paymentCompleted) {
    return res.redirect("/payment-required");
  }
  
  // Send Discord notification if not sent before
  if (!res.locals.messageSent) {
    const webhookURL = process.env.DISCORD_WEBHOOK;
    
    // Create detailed order notification
    const payload = {
      content: `✅ New Verified Order (#${orderId}) from IP: ${clientIp}`,
      embeds: [{
        title: "Order Details",
        fields: [
          { name: "Customer", value: `${orderInfo.orderDetails.firstName} ${orderInfo.orderDetails.lastName}`, inline: true },
          { name: "Email", value: orderInfo.email, inline: true },
          { name: "Amount", value: `$${orderInfo.orderAmount}`, inline: true },
          { name: "Address", value: `${orderInfo.orderDetails.street}, ${orderInfo.orderDetails.city}, ${orderInfo.orderDetails.state} ${orderInfo.orderDetails.postal}` }
        ],
        color: 3066993 // Green color
      }]
    };

    fetch(webhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => response.text())
      .then(data => console.log("Order confirmation sent to Discord:", data))
      .catch(error => console.error("Error sending to Discord:", error));
  }

  // Serve the successful order confirmation HTML page
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Order Success</title>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: #f9fafb;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      color: #1f2937;
    }
    .success-card {
      background-color: white;
      border-radius: 16px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
      padding: 40px;
      width: 90%;
      max-width: 480px;
      text-align: center;
      animation: fadeIn 0.6s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .checkmark-circle {
      width: 80px;
      height: 80px;
      position: relative;
      display: inline-block;
      margin-bottom: 20px;
    }
    .checkmark-circle-bg {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background-color: #ecfdf5;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .checkmark {
      color: #10b981;
      font-size: 40px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      font-weight: 600;
    }
    p {
      margin: 0 0 24px 0;
      color: #6b7280;
      font-size: 16px;
      line-height: 1.5;
    }
    .order-details {
      background-color: #f9fafb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      text-align: left;
    }
    .order-number {
      font-weight: 600;
      margin-bottom: 8px;
    }
    .order-date {
      color: #6b7280;
      font-size: 14px;
    }
    .primary-button {
      background-color: #10b981;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
      width: 100%;
      margin-bottom: 12px;
    }
    .primary-button:hover {
      background-color: #059669;
    }
    .secondary-button {
      background-color: transparent;
      color: #4b5563;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
      width: 100%;
    }
    .secondary-button:hover {
      background-color: #f3f4f6;
    }
  </style>
</head>
<body>
  <div class="success-card">
    <div class="checkmark-circle">
      <div class="checkmark-circle-bg">
        <span class="checkmark">✓</span>
      </div>
    </div>

    <h1>Order Confirmed!</h1>
    <p>Thank you for your purchase. We've received your order and are processing it now.</p>

    <div class="order-details">
      <div class="order-number">Order #${orderId.slice(0, 8).toUpperCase()}</div>
      <div class="order-date">Date: ${new Date().toLocaleDateString()}</div>
    </div>

    <button class="primary-button">Shipping details will appear in your email in about 1-8 hours</button>
  </div>
</body>
</html>`;

  res.send(htmlContent);
});

// Fallback endpoint for direct access attempts
app.get("*", (req, res) => {
  res.status(403).send("Invalid access. Please complete checkout first.");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
