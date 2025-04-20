import { loadStripe } from "@stripe/stripe-js";

export const stripePromise = loadStripe(
  process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY
);

export const GOLD_PLAN_PRICE = process.env.REACT_APP_STRIPE_GOLD_PLAN_PRICE;
