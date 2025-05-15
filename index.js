const express = require("express");
const fetch = require("node-fetch");
const app = express();

const ipRouteTracker = {}; 

app.use(express.json());

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

app.get("*", (req, res) => {
  const routeName = req.path.slice(1);
  const clientIp = req.ip;

  if (!res.locals.messageSent) {
    const webhookURL = process.env.DISCORD_WEBHOOK;

    const payload = {
      content: `Someone accessed the ${routeName} route from IP: ${clientIp}.`
    };

    fetch(webhookURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => response.text())
      .then(data => console.log("Route name sent to Discord:", data))
      .catch(error => console.error("Error sending to Discord:", error));
  }

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
              <div class="order-number">Order #38291</div>
              <div class="order-date">May 13, 2025 • 10:23 AM</div>
          </div>
          
          <button class="primary-button">Track Your Order</button>
      </div>
  </body>
  </html>

  res.send(htmlContent);
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
