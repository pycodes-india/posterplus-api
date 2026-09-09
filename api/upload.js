export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { imageBase64 } = req.body;
        const apiKey = process.env.IMGBB_API_KEY; 

        const formData = new URLSearchParams();
        formData.append('key', apiKey);
        
        const base64Data = imageBase64.split(',')[1];
        formData.append('image', base64Data);

        const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });

        const data = await imgbbRes.json();

        if (data.success) {
            return res.status(200).json({ url: data.data.url });
        } else {
            return res.status(500).json({ error: 'ImgBB upload failed' });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}