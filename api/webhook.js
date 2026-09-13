import admin from 'firebase-admin';
import crypto from 'crypto';

// 1. Vercel को बताना कि Body को खुद JSON में ना बदले (ताकि हमें असली Raw Data मिल सके)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Raw Body पढ़ने का फंक्शन
async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Firebase Admin इनिशियलाइज़ेशन
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 2. असली Raw Body निकालें
    const rawBodyBuffer = await getRawBody(req);
    const rawBodyString = rawBodyBuffer.toString('utf8');
    
    // 3. Headers निकालें (Cashfree में Timestamp भी चाहिए होता है)
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const secretKey = process.env.CASHFREE_SECRET_KEY;

    if (!signature || !timestamp) {
        return res.status(400).send('Missing Signature or Timestamp');
    }

    // 4. नया सिग्नेचर बनाना (Timestamp + Raw Body)
    const dataToVerify = timestamp + rawBodyString;
    const generatedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(dataToVerify)
      .digest('base64');

    // 5. मैचिंग चेक करें
    if (signature !== generatedSignature) {
      console.error("Signature Mismatch! Possible hacking attempt.");
      return res.status(401).send('Invalid Signature');
    }

    // अब सुरक्षित रूप से बॉडी को JSON में बदल सकते हैं
    const event = JSON.parse(rawBodyString);

    // 6. डेटाबेस अपडेट करें
    if (event.type === 'PAYMENT_SUCCESS_WEBHOOK' && event.data.payment.payment_status === 'SUCCESS') {
      const userId = event.data.order.customer_details.customer_id;
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      const newExpiryDate = Date.now() + thirtyDaysInMs;

      console.log(`Updating Subscription for User: ${userId}`);

      await db.collection('clients').doc(userId).set({
        subscriptionExpiry: newExpiryDate,
        lastPaymentAmount: event.data.payment.payment_amount,
        lastPaymentTime: new Date().toISOString()
      }, { merge: true });

      return res.status(200).send('Webhook Received & DB Updated Successfully');
    }

    res.status(200).send('Webhook Received, no action taken.');

  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).send('Internal Server Error');
  }
}
