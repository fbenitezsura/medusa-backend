// ────────────────────────────────────────────────────────────────
// FILE: src/api/payment/[order_id]/stripe-capture.ts
// Endpoint  ➜  POST /payment/:order_id/stripe-capture
//
// Hace lo MISMO que tu callback de Flow, pero para Stripe:
//
//   1.  Lee la orden del Admin API.
//   2.  Obtiene el PaymentIntent ID que guardaste en el
//       payment‑session de Stripe (`data.id` o desde client_secret).
//   3.  Pregunta a Stripe el estado real del PaymentIntent.
//   4.  Si está “succeeded” o “requires_capture”, llama al
//       Admin API   /admin/orders/:id/capture   para marcar el
//       pedido como “pagado” dentro de Medusa.
//   5.  Devuelve un JSON con el resultado.
// ────────────────────────────────────────────────────────────────
import Stripe from "stripe"
import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-04-30.basil',
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const order_id = req.params.order_id

  const STATUS_TEXT: Record<string, string> = {
    succeeded: "pagada",
    requires_capture: "pendiente de captura",
    requires_payment_method: "pendiente de pago",
    canceled: "anulada",
    processing: "procesando",
  }

  try {
    /* ── 1) Leer orden en Medusa ─────────────────────────────── */
    const adminHeaders = {
      "x-medusa-access-token": process.env.API_KEY_MEDUSA!,
    }

    const orderResp = await fetch(
      `${process.env.MEDUSA_ADMIN_BACKEND_URL}/admin/orders/${order_id}`,
      { method: "GET", headers: adminHeaders }
    )
    const orderData = await orderResp.json()

    if (!orderData.order) {
      return res.status(404).json({ message: "Order not found" })
    }

    /* ── 2) Localizar sesión de pago Stripe ──────────────────── */
    const stripePayment = orderData.order.payments.find(
      (p: any) => p.provider_id === "stripe-payment"
    )

    if (!stripePayment) {
      return res
        .status(400)
        .json({ message: "Stripe payment session not found in order" })
    }

    // Intent ID puede venir directo o dentro del client_secret.
    let paymentIntentId: string | undefined =
      stripePayment.data?.id as string | undefined

    if (!paymentIntentId && stripePayment.data?.client_secret) {
      paymentIntentId = (stripePayment.data.client_secret as string).split(
        "_secret"
      )[0] // pi_XXXX
    }

    if (!paymentIntentId) {
      return res
        .status(400)
        .json({ message: "PaymentIntent ID not found in session data" })
    }

    /* ── 3) Consultar estado real en Stripe ───────────────────── */
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId)

    /* ── 4) Si procede, capturamos la orden en Medusa ─────────── */
    if (intent.status === "succeeded" || intent.status === "requires_capture") {
      // Si configuraste capture_method=manual, primero capturamos en Stripe
      if (intent.status === "requires_capture") {
        await stripe.paymentIntents.capture(paymentIntentId)
      }

      // Ahora capturamos la orden en Medusa (marca “pagada”)
      const captureResp = await fetch(
        `${process.env.MEDUSA_ADMIN_BACKEND_URL}/admin/orders/${order_id}/capture`,
        { method: "POST", headers: adminHeaders }
      )
      const captureData = await captureResp.json()

      return res.json({
        message: "payment capture successful",
        amount: captureData.order.total,
        status: STATUS_TEXT[intent.status] || intent.status,
      })
    }

    /* ── 5) Si no se puede capturar aún ───────────────────────── */
    return res.json({
      message: "payment not captured",
      status: STATUS_TEXT[intent.status] || intent.status,
    })
  } catch (err: any) {
    console.error(err)
    return res.status(500).json({
      message: "Error al capturar el pago",
      detail: err.message || err,
    })
  }
}
