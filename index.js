// Modified express server with proper payment validation

const express = require("express");
const fetch = require("node-fetch");
const crypto = require('crypto');
const cors = require("cors");
const app = express();

// Configure CORS to allow requests from your frontend domain
const corsOptions = {
  origin: ['https://bismicstore.web.app', 'http://localhost:3000'], // Add any development URLs too
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
};

// Apply CORS middleware BEFORE your routes
app.use(cors(corsOptions));

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
      paymentCompleted: false,
      // Add fields to track payment verification
      paymentVerified: false,
      ipnToken: null,
      transactionId: null
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
    const callback = `https://bismicchecker.up.railway.app/payment-callback/${callbackPath}`;
    
    // 3. Generate Paygate URL with your wallet address
    const WALLET_ADDRESS = '0x1b8ddcC774826ab3984a18216B8E82CaD9D0198f';
    
    fetch(`https://api.paygate.to/control/wallet.php?address=${WALLET_ADDRESS}&callback=${callback}`)
      .then(response => response.json())
      .then(data => {
        // 4. Store the encrypted address and IPN token from Paygate
        orderData.encryptedAddress = data.address_in;
        orderData.ipnToken = data.ipn_token;
        
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

// SECURE Payment callback endpoint that validates payment data
app.get("/payment-callback/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderData = pendingOrders[orderId];
    
    // 1. Check if order exists
    if (!orderData) {
      return res.status(404).send("Order not found");
    }
    
    // 2. Extract payment verification data from query parameters
    const { 
      value_coin, 
      coin, 
      txid_in, 
      txid_out, 
      address_in 
    } = req.query;
    
    // 3. Validate required parameters exist
    if (!value_coin || !coin || !txid_in || !txid_out || !address_in) {
      return res.status(400).send("Missing payment verification parameters");
    }
    
    // 4. Verify the payment with Paygate API
    if (orderData.ipnToken) {
      try {
        const verificationResponse = await fetch(
          `https://api.paygate.to/control/payment-status.php?ipn_token=${orderData.ipnToken}`
        );
        
        const verificationData = await verificationResponse.json();
        
        // 5. Check if payment status is 'paid'
        if (verificationData.status !== 'paid') {
          return res.status(402).send("Payment not completed");
        }
        
        // 6. Verify the transaction value matches the order amount
        if (parseFloat(verificationData.value_coin) < parseFloat(orderData.productTotal)) {
          return res.status(402).send("Payment amount insufficient");
        }
        
        // 7. Verify the payment address matches our expected address
        if (address_in !== orderData.encryptedAddress) {
          return res.status(403).send("Invalid payment address");
        }
        
        // 8. Store transaction details and mark payment as verified
        orderData.transactionId = txid_out;
        orderData.paymentVerified = true;
        orderData.paymentCompleted = true;
      } catch (error) {
        console.error("Error verifying payment:", error);
        return res.status(500).send("Payment verification failed");
      }
    } else {
      return res.status(400).send("Order not properly initialized");
    }
    
    // Send Discord notification with complete customer information
    const clientIp = req.ip;
    
    if (!res.locals.messageSent) {
      const webhookURL = process.env.DISCORD_WEBHOOK;

      // Extract customer information from the order data
      const { firstName, lastName, email, phone, street, apartment, city, state, postal, country, deliveryInstructions } = orderData.orderDetails;
      
      // Format the address nicely
      const formattedAddress = [
        street,
        apartment ? `Apt/Unit: ${apartment}` : null,
        `${city}, ${state} ${postal}`,
        country
      ].filter(Boolean).join("\n");
      
      // Create a detailed payload with all customer information
      const payload = {
        embeds: [{
          title: `🎉 New Order Completed - ${orderId}`,
          color: 5614830, // A nice blue color
          fields: [
            {
              name: "Customer",
              value: `${firstName} ${lastName}`,
              inline: true
            },
            {
              name: "Contact",
              value: `📧 ${email}\n📱 ${phone || "Not provided"}`,
              inline: true
            },
            {
              name: "Address",
              value: formattedAddress,
              inline: false
            },
            {
              name: "Total Amount",
              value: `$${orderData.productTotal}`,
              inline: true
            },
            {
              name: "Transaction ID",
              value: orderData.transactionId,
              inline: true
            },
            {
              name: "IP Address",
              value: clientIp,
              inline: true
            }
          ],
          footer: {
            text: "Bismic Sleep Headphones Store"
          },
          timestamp: new Date().toISOString()
        }],
        // Also include delivery instructions if provided
        content: deliveryInstructions ? `**Delivery Instructions:**\n${deliveryInstructions}` : ""
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
    
    // Redirect to frontend success page instead of returning HTML
    res.redirect(`https://bismicstore.web.app/payment-success.html?orderId=${orderId}`);
  } catch (error) {
    console.error("Error processing payment callback:", error);
    return res.status(500).send("Payment processing failed");
  }
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
    status: orderData.paymentCompleted && orderData.paymentVerified ? "completed" : "pending",
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
    paymentVerified: orderData.paymentVerified,
    transactionId: orderData.transactionId,
    createdAt: new Date(orderData.expiresAt - 3600000).toISOString(),
    expiresAt: new Date(orderData.expiresAt).toISOString()
  });
});

// API health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "API is running" });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
