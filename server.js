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
        await db.insert({ 
            x: parseInt(data.x), 
            y: parseInt(data.y), 
            color: data.color, 
            link: data.link,
            timestamp: new Date()
        });
        console.log(`Pixel at ${data.x}, ${data.y} saved!`);
    }
    res.json({received: true});
});

// Standard JSON parsers and static directories applied below webhook configurations
app.use(express.json());
app.use(express.static('public')); 

// Create Dynamic Stripe Session
app.post('/create-checkout-session', async (req, res) => {
    const { x, y, color, link } = req.body;
    
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { 
                        name: `Pixel at ${x}, ${y}`,
                        description: `Color: ${color} | Link: ${link}`
                    },
                    unit_amount: 100, // $1.00
                },
                quantity: 1,
            }],
            mode: 'payment',
            metadata: { x, y, color, link },
            success_url: `https://${req.get('host')}/index.html?status=success`,
            cancel_url: `https://${req.get('host')}/`,
        });

        res.json({ url: session.url });
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
