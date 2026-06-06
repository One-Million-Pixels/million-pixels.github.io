const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Set in Render dashboard environment variables
const Datastore = require('nedb-promises');
const path = require('path');
const app = express();

const db = Datastore.create('pixels.db');

// FIXED: Webhook route MUST sit up here before express.json() parses request streams globally.
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.log(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const data = event.data.object.metadata;
        
        // Ensure metadata exists before injecting into database
        if (data && data.x && data.y) {
            await db.insert({ 
                x: parseInt(data.x), 
                y: parseInt(data.y), 
                color: data.color, 
                link: data.link,
                timestamp: new Date()
            });
            console.log(`Pixel at ${data.x}, ${data.y} saved!`);
        }
    }
    res.json({received: true});
});

// Standard JSON parses and static directories applied below webhook configurations
app.use(express.json());
app.use(express.static('public')); 

// Pass-through route using your updated custom Stripe Payment Link
app.post('/create-checkout-session', async (req, res) => {
    const { x, y, color, link } = req.body;
    
    try {
        // Base payment link updated to your new link
        const basePaymentLink = "https://buy.stripe.com/14A5kwf9g8WxeDv8VI2sM02";
        
        // Unique tracking identifier based on coordinates
        const client_reference_id = `pixel_${x}_${y}`;
        
        // Append metadata directly to your new link as URL parameters
        const stripeUrl = `${basePaymentLink}?client_reference_id=${client_reference_id}&prefilled_metadata[x]=${x}&prefilled_metadata[y]=${y}&prefilled_metadata[color]=${encodeURIComponent(color)}&prefilled_metadata[link]=${encodeURIComponent(link)}`;

        // Return the tracking-ready URL back to the frontend
        res.json({ url: stripeUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all pixels
app.get('/api/pixels', async (req, res) => {
    try {
        const pixels = await db.find({});
        res.json(pixels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));