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

// Standard JSON parsers and static directories applied below webhook configurations
app.use(express.json());
app.use(express.static('public')); 

// Pass-through route using your custom Stripe Payment Link
app.post('/create-checkout-session', async (req, res) => {
    const { x, y, color, link } = req.body;
    
    try {
        // Base payment link provided by you
        const basePaymentLink = "https://buy.stripe.com/7sY14g0emb4F2UNgoa2sM01";
        
        // Encode metadata directly into the URL parameters for the payment link
        const client_reference_id = `pixel_${x}_${y}`;
        
        // Stripe payment links allow passing metadata through URL parameters: ?prefilled_promo_code= etc.
        // To natively pass custom metadata strings, we append client_reference_id or pass metadata parameters
        const stripeUrl = `${basePaymentLink}?client_reference_id=${client_reference_id}&prefilled_metadata[x]=${x}&prefilled_metadata[y]=${y}&prefilled_metadata[color]=${encodeURIComponent(color)}&prefilled_metadata[link]=${encodeURIComponent(link)}`;

        // Send URL back to client to redirect
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