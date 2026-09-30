const stripeKey = process.env.STRIPE_SECRET_KEY;
const resendKey = process.env.RESEND_API_KEY;
console.log(Boolean(stripeKey && resendKey));
