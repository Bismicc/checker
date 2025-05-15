const express = require("express");
const fetch = require("node-fetch");
const crypto = require('crypto');
const app = express();

// Store for pending orders with validation tokens
const pendingOrders = {};

// IP tracker to prevent webhook spam (keeping this from original)
const ipRouteTracker = {}; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware for IP tracking (keeping this from original)
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

// New endpoint to initiate order and get a secure token
app.post("/api/create-order", (req, res) => {
  try {
    // 1. Validate the incoming order data
    const { 
      firstName, lastName, email, phone, 
      street, apartment, city, state, postal, country,
      deliveryInstructions, productTotal 
    } = req.body;
    
    // Basic validation
    if (!firstName || !lastName || !email || !street || !city || !state || !postal || !country || !productTotal) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // 2. Create a unique order ID and secure token
    const orderId = crypto.randomUUID();
    const orderToken = crypto.randomBytes(32).toString('hex');
    
    // 3. Store order details with token (with 1-hour expiration)
    const expiresAt = Date.now() + 3600000; // 1 hour
    pendingOrders[orderId] = {
      orderDetails: {
        firstName, lastName, email, phone,
        street, apartment, city, state, postal, country,
        deliveryInstructions
      },
      productTotal,
      orderToken,
      expiresAt,
      paymentCompleted: false
    };
    
    // 4. Return only the order ID and token to the client
    return res.status(200).json({ 
      orderId, 
      orderToken,
      expiresAt 
    });
  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(500).json({ error: "Failed to create order" });
  }
});

// Process payment endpoint that creates the redirect URL
app.post("/api/process-payment", (req, res) => {
  try {
    // 1. Validate the order token
    const { orderId, orderToken } = req.body;
    
    if (!orderId || !orderToken) {
      return res.status(400).json({ error: "Missing order details" });
    }
    
    const orderData = pendingOrders[orderId];
    
    if (!orderData || orderData.orderToken !== orderToken || Date.now() > orderData.expiresAt) {
      return res.status(401).json({ error: "Invalid or expired order" });
    }
    
    // 2. Create a secure callback URL with only order ID (no personal info)
    const callbackPath = encodeURIComponent(`${orderId}`);
    const callback = `https://yourserver.com/payment-callback/${callbackPath}`;
    
    // 3. Generate Paygate URL with your wallet address
    const WALLET_ADDRESS = '0x1b8ddcC774826ab3984a18216B8E82CaD9D0198f';
    
    fetch(`https://api.paygate.to/control/wallet.php?address=${WALLET_ADDRESS}&callback=${callback}`)
      .then(response => response.json())
      .then(data => {
        // 4. Store the encrypted address from Paygate
        orderData.encryptedAddress = data.address_in;
        
        // 5. Generate the payment URL
        const paymentUrl = `https://checkout.paygate.to/process-payment.php?address=${data.address_in}&amount=${orderData.productTotal}&provider=wert&email=${encodeURIComponent(orderData.orderDetails.email)}&currency=USD`;
        
        // 6. Return payment URL to client
        return res.status(200).json({ 
          paymentUrl,
          status: "pending"
        });
      })
      .catch(error => {
        console.error("Error with Paygate:", error);
        return res.status(500).json({ error: "Payment provider error" });
      });
  } catch (error) {
    console.error("Error processing payment:", error);
    return res.status(500).json({ error: "Failed to process payment" });
  }
});

// Payment callback endpoint (only orderId in URL)
app.get("/payment-callback/:orderId", (req, res) => {
  const { orderId } = req.params;
  const orderData = pendingOrders[orderId];
  
  if (!orderData) {
    return res.status(404).send("Order not found");
  }
  
  // Mark payment as completed (in reality, you'd verify this with Paygate)
  orderData.paymentCompleted = true;
  
  // Send Discord notification (kept from original)
  const clientIp = req.ip;
  
  if (!res.locals.messageSent) {
    const webhookURL = process.env.DISCORD_WEBHOOK;

    const payload = {
      content: `Order completed for order ID: ${orderId} from IP: ${clientIp}.`
    };

    fetch(webhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => response.text())
      .then(data => console.log("Order notification sent to Discord:", data))
      .catch(error => console.error("Error sending to Discord:", error));
  }
  
  // Return success page
  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
              <div class="order-number">Order #${orderId.substring(0, 8)}</div>
              <div class="order-date">${new Date().toLocaleDateString()} • ${new Date().toLocaleTimeString()}</div>
          </div>
          
          <button class="primary-button" onclick="window.location.href='/'">Return to Home</button>
      </div>
  </body>
  </html>
  `;

  res.send(htmlContent);
});

// Check order status endpoint
app.get("/api/order-status/:orderId", (req, res) => {
  const { orderId } = req.params;
  const { orderToken } = req.query;
  
  if (!orderId || !orderToken) {
    return res.status(400).json({ error: "Missing order information" });
  }
  
  const orderData = pendingOrders[orderId];
  
  if (!orderData || orderData.orderToken !== orderToken) {
    return res.status(401).json({ error: "Invalid order information" });
  }
  
  return res.status(200).json({
    status: orderData.paymentCompleted ? "completed" : "pending",
    expiresAt: orderData.expiresAt
  });
});

// Secure API to verify if an order was actually paid (for admin use)
app.get("/api/admin/verify-order/:orderId", (req, res) => {
  // Implement admin authentication here
  const adminKey = req.headers['x-admin-key'];
  
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const { orderId } = req.params;
  const orderData = pendingOrders[orderId];
  
  if (!orderData) {
    return res.status(404).json({ error: "Order not found" });
  }
  
  return res.status(200).json({
    orderDetails: orderData.orderDetails,
    productTotal: orderData.productTotal,
    paymentCompleted: orderData.paymentCompleted,
    createdAt: new Date(orderData.expiresAt - 3600000).toISOString(),
    expiresAt: new Date(orderData.expiresAt).toISOString()
  });
});

// Serve your frontend files here
app.use(express.static('public'));

// Cleanup expired orders periodically
setInterval(() => {
  const now = Date.now();
  for (const [orderId, orderData] of Object.entries(pendingOrders)) {
    if (now > orderData.expiresAt) {
      delete pendingOrders[orderId];
    }
  }
}, 3600000); // Run every hour

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
