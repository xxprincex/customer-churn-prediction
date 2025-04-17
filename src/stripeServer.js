const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const functions = require("firebase-functions");
const cors = require("cors")({ origin: true });

exports.createCheckoutSession = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { userId, priceId } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${req.headers.origin}/account?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/account`,
        client_reference_id: userId,
      });

      res.json({ sessionId: session.id });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: error.message });
    }
  });
});

exports.handleWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      endpointSecret
    );

    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        await handleSuccessfulPayment(session);
        break;
      case "customer.subscription.deleted":
        const subscription = event.data.object;
        await handleCancelledSubscription(subscription);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook Error:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

async function handleSuccessfulPayment(session) {
  const userId = session.client_reference_id;
  const admin = require("firebase-admin");
  const db = admin.firestore();

  await db.collection("Users").doc(userId).update({
    subscriptionPlan: "Gold",
    stripeCustomerId: session.customer,
    subscriptionId: session.subscription,
    subscriptionStatus: "active",
    trialEndDate: null,
  });
}

async function handleCancelledSubscription(subscription) {
  const admin = require("firebase-admin");
  const db = admin.firestore();

  // Find user with this subscription ID
  const usersRef = db.collection("Users");
  const snapshot = await usersRef
    .where("subscriptionId", "==", subscription.id)
    .get();

  if (!snapshot.empty) {
    const userId = snapshot.docs[0].id;
    await usersRef.doc(userId).update({
      subscriptionPlan: "Free",
      subscriptionStatus: "cancelled",
    });
  }
}
