const express = require("express");
const fetch = require("node-fetch");
const app = express();  // Initialize the app instance

// In-memory store for IPs and the routes they have accessed
const ipRouteTracker = {}; 

app.use(express.json()); // Middleware to handle JSON requests

// Middleware to check if the IP has already accessed the route
app.use((req, res, next) => {
  const clientIp = req.ip; // Get the IP address of the client
  const routeName = req.path.slice(1); // Extract the route name (e.g., /test -> test)

  // Initialize the IP entry in the tracker if it doesn't exist
  if (!ipRouteTracker[clientIp]) {
    ipRouteTracker[clientIp] = {};
  }

  // Check if this IP has already accessed this route
  if (ipRouteTracker[clientIp][routeName]) {
    // If the IP has already accessed this route, skip sending the webhook
    res.locals.messageSent = true;
  } else {
    // If the IP hasn't accessed this route yet, mark it
    ipRouteTracker[clientIp][routeName] = true;
    res.locals.messageSent = false; // No message has been sent for this route yet
  }

  // Proceed with the request
  next();
});

// Define the catch-all route to capture any URL
app.get("*", (req, res) => {
  const routeName = req.path.slice(1); // Get the full path (e.g., /test -> test)
  console.log("Accessed route:", routeName);

  const clientIp = req.ip; // Get the IP address of the client

  // If the message hasn't been sent yet, send the webhook
  if (!res.locals.messageSent) {
    // Send the route name to Discord via webhook
    const webhookURL = process.env.DISCORD_WEBHOOK; // Your Discord webhook URL

    const payload = {
      content: Someone accessed the ${routeName} route from IP: ${clientIp}.
    };

    // Send to Discord webhook
    fetch(webhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(response => response.text())
    .then(data => console.log("Route name sent to Discord:", data))
    .catch(error => console.error("Error sending to Discord:", error));
  }

  // HTML content to be rendered on every access
  const htmlContent = 
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
              <div class="order-number">Order #38291</div>
              <div class="order-date">May 13, 2025 • 10:23 AM</div>
          </div>
          
          <button class="primary-button">Track Your Order</button>
      </div>
  </body>
  </html>
  ;

  // Send the HTML content
  res.send(htmlContent);
});

// Start the server
app.listen(3000, () => {
  console.log("Server running on port 3000");
});
