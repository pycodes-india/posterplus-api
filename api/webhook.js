import admin from 'firebase-admin';
import crypto from 'crypto';

// Firebase Admin को इनिशियलाइज़ करना (सिर्फ एक बार)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel में Private Key के \n को सही से लाइन ब्रेक में बदलने के लिए
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
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-webhook-signature'];
    const secretKey = process.env.CASHFREE_SECRET_KEY;

    // 1. सुरक्षा जाँच: क्या यह रिक्वेस्ट सच में Cashfree से आई है?
    const generatedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(req.rawBody || rawBody)
      .digest('base64');

    // (अगर सिग्नेचर मैच नहीं होता है, तो हैकर ने रिक्वेस्ट भेजी है)
    if (signature !== generatedSignature) {
      console.error("Signature Mismatch! Possible hacking attempt.");
      return res.status(401).send('Invalid Signature');
    }

    const event = req.body;

    // 2. चेक करें कि क्या पेमेंट सक्सेसफुल (PAID) है?
    if (event.type === 'PAYMENT_SUCCESS_WEBHOOK' && event.data.payment.payment_status === 'SUCCESS') {
      
      // 3. कस्टमर ID निकालें (यह वही Firebase UID है जो हमने frontend से भेजी थी)
      const userId = event.data.order.customer_details.customer_id;

      // 4. Firebase में 30 दिन (Milliseconds) का टाइम जोड़ें
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      const newExpiryDate = Date.now() + thirtyDaysInMs;

      console.log(`Updating Subscription for User: ${userId}`);

      // 5. यूज़र का डेटाबेस अपडेट करें
      await db.collection('clients').doc(userId).set({
        subscriptionExpiry: newExpiryDate,
        lastPaymentAmount: event.data.payment.payment_amount,
        lastPaymentTime: new Date().toISOString()
      }, { merge: true }); // merge: true का मतलब है कि पुराना डेटा डिलीट नहीं होगा, बस नया अपडेट होगा

      return res.status(200).send('Webhook Received & DB Updated Successfully');
    }

    // अगर कोई और इवेंट है (जैसे Payment Failed), तो कुछ मत करो
    res.status(200).send('Webhook Received, no action taken.');

  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).send('Internal Server Error');
  }
}
