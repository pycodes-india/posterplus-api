import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  // 1. CORS Headers Set Karein (Taaki browser block na kare)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Ya apna exact frontend domain likhein jaise 'https://posterplus.pycodes.in'
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Preflight OPTIONS request handle karne ke liye
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Firebase Auth Token Verification
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }
    const token = authHeader.split('Bearer ')[1];
    await getAuth().verifyIdToken(token);

    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }

    // 3. Server-side File Type & Size Validation (Max 2MB)
    const matches = imageBase64.match(/^data:image\/([a-zA-Z+-]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: "Invalid image format" });
    }
    const imageType = matches[1].toLowerCase();
    const allowedTypes = ['jpg', 'jpeg', 'png', 'webp'];
    if (!allowedTypes.includes(imageType)) {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: "File too large (Max 2MB)" });
    }

    // 4. Forward to ImgBB securely
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server configuration error: ImgBB key missing" });
    }

    const formData = new URLSearchParams();
    formData.append('key', apiKey);
    formData.append('image', matches[2]);

    const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });

    const data = await imgbbRes.json();
    if (data.success) {
      return res.status(200).json({ url: data.data.url });
    } else {
      return res.status(500).json({ error: data.error?.message || 'ImgBB upload failed' });
    }
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(401).json({ error: "Authentication failed or server error" });
  }
}
