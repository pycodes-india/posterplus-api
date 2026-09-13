// File: api/create-order.js

export default async function handler(req, res) {
  // CORS Headers (ताकि आपकी वेबसाइट से रिक्वेस्ट आ सके)
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Pre-flight request (OPTIONS) को हैंडल करना
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // सिर्फ POST रिक्वेस्ट की अनुमति देना
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST requests allowed' });
  }

  // हर पेमेंट के लिए एक नया और यूनीक Order ID बनाना
  const orderId = 'ORDER_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

  const options = {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-api-version': '2023-08-01',
      // Vercel Environment Variables से अपनी Keys डालें
      'x-client-id': process.env.CASHFREE_APP_ID,
      'x-client-secret': process.env.CASHFREE_SECRET_KEY
    },
    body: JSON.stringify({
      order_amount: req.body.amount, 
      order_currency: 'INR',
      order_id: orderId,
      customer_details: {
        customer_id: req.body.customerId,
        customer_phone: req.body.phone || '9999999999',
        customer_email: req.body.email || 'user@example.com',
        customer_name: req.body.name || 'PosterPlus User'
      },
      order_meta: {
        // पेमेंट पूरा होने के बाद यूज़र वापस कहाँ जाएगा (आपकी वेबसाइट का लिंक)
        return_url: 'https://posterplus.pycodes.in/?order_id={order_id}' 
      }
    })
  };

  try {
    // Cashfree Sandbox (Test) API पर रिक्वेस्ट भेजना
    const response = await fetch('https://sandbox.cashfree.com/pg/orders', options);
    const data = await response.json();
    
    // फ्रंटएंड को डेटा वापस भेजना
    res.status(200).json(data); 
  } catch (error) {
    console.error("Cashfree API Error:", error);
    res.status(500).json({ error: 'Failed to create order' });
  }
}
