import Stripe from "stripe"
import {
  AbstractPaymentProcessor,
  PaymentProcessorContext,
  PaymentProcessorError,
  PaymentProviderService,
  PaymentSessionStatus,
  PaymentProcessorSessionResponse,
} from "@medusajs/medusa"

/**
 * Utilidad mínima para convertir montos a la unidad
 * que Stripe espera (centavos para la mayoría de las monedas,
 * sin decimales para las “zero‑decimal” como CLP, JPY…).
 */
const toStripeAmount = (amount: number, currency: string) => {
  const zeroDecimalCurrencies = [
    "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
    "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
  ]
  return zeroDecimalCurrencies.includes(currency.toUpperCase())
    ? amount
    : Math.round(amount * 100)
}

class StripePaymentService extends AbstractPaymentProcessor {
  static identifier = "stripe-payment"

  protected stripe: Stripe
  protected paymentProviderService: PaymentProviderService

  constructor(container: any, options: Record<string, unknown>) {
    super(container)

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2025-04-30.basil',
    })

    this.paymentProviderService = container.paymentProviderService
  }

  /* ────────────────────────────────
   * 1. INITIATE
   *    Crea el PaymentIntent tan pronto el cliente
   *    selecciona Stripe como método de pago.
   * ──────────────────────────────── */
  async initiatePayment(
    context: PaymentProcessorContext
  ): Promise<PaymentProcessorSessionResponse | PaymentProcessorError> {
    try {
      const { amount, currency_code, resource_id: cartId, customer } = context

      const intent = await this.stripe.paymentIntents.create({
        amount: toStripeAmount(amount, currency_code),
        currency: currency_code,
        metadata: {
          cart_id: cartId,
          customer_id: customer?.id,
        },
        capture_method: "manual", // Medusa captura después
      })

      return {
        session_data: {
          id: intent.id,
          provider_id: StripePaymentService.identifier,
          amount,
          currency_code,
          cart_id: cartId,
          data: { client_secret: intent.client_secret },
          status: PaymentSessionStatus.PENDING,
          created_at: new Date(),
          updated_at: new Date(),
          is_initiated: true,
          is_selected: true,
          idempotency_key: null,
          payment_authorized_at: null,
        },
      }
    } catch (e: any) {
      return { error: e.message }
    }
  }

  /* ────────────────────────────────
   * 2. AUTHORIZE
   *    Comprueba el estado del intent y lo marca como
   *    autorizado cuando Stripe lo confirme.
   * ──────────────────────────────── */
  async authorizePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<
    | { status: PaymentSessionStatus; data: Record<string, unknown> }
    | PaymentProcessorError
  > {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(
        paymentSessionData.id as string
      )

      if (intent.status === "requires_capture" || intent.status === "succeeded") {
        return {
          status: PaymentSessionStatus.AUTHORIZED,
          data: { id: intent.id, status: intent.status },
        }
      }

      return {
        status: PaymentSessionStatus.PENDING,
        data: { id: intent.id, status: intent.status },
      }
    } catch (e: any) {
      return { error: e.message }
    }
  }

  /* ────────────────────────────────
   * 3. CAPTURE
   *    Captura fondos de un PaymentIntent autorizado.
   * ──────────────────────────────── */
  async capturePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    try {
      const intent = await this.stripe.paymentIntents.capture(
        paymentSessionData.id as string
      )
      return { id: intent.id, status: intent.status }
    } catch (e: any) {
      return { error: e.message }
    }
  }

  /* ────────────────────────────────
   * 4. CANCEL
   * ──────────────────────────────── */
  async cancelPayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    try {
      const intent = await this.stripe.paymentIntents.cancel(
        paymentSessionData.id as string
      )
      return { id: intent.id, status: intent.status }
    } catch (e: any) {
      return { error: e.message }
    }
  }

  /* ────────────────────────────────
   * 5. REFUND
   * ──────────────────────────────── */
  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentSessionData.id as string,
        amount: refundAmount ? toStripeAmount(refundAmount, "usd") : undefined,
      })
      return { id: refund.id, status: refund.status }
    } catch (e: any) {
      return { error: e.message }
    }
  }

  /* ────────────────────────────────
   * 6. RETRIEVE STATUS
   * ──────────────────────────────── */
  async getPaymentStatus(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentSessionStatus> {
    const intent = await this.stripe.paymentIntents.retrieve(
      paymentSessionData.id as string
    )

    switch (intent.status) {
      case "requires_payment_method":
      case "requires_action":
      case "processing":
        return PaymentSessionStatus.PENDING
      case "requires_capture":
      case "succeeded":
        return PaymentSessionStatus.AUTHORIZED
      case "canceled":
        return PaymentSessionStatus.CANCELED
      default:
        return PaymentSessionStatus.PENDING
    }
  }

  /* ────────────────────────────────
   * 7. UPDATE (por si necesitas cambiar M‑P‑I)
   * ──────────────────────────────── */
  async updatePayment(
    context: PaymentProcessorContext
  ): Promise<PaymentProcessorSessionResponse | PaymentProcessorError | void> {
    try {
      const intentId = context.paymentSessionData.id as string

      const intent = await this.stripe.paymentIntents.update(intentId, {
        metadata: {
          ...context.metadata,
          updated_at: new Date().toISOString(),
        },
      })

      return {
        session_data: {
          ...context.paymentSessionData,
          updated_at: new Date(),
          data: { client_secret: intent.client_secret },
        },
      }
    } catch (e: any) {
      return { error: e.message }
    }
  }

  /* ────────────────────────────────
   * 8. UPDATE DATA (checkout‑session, etc.)
   *    Se usa en Medusa Admin para refrescar client_secret.
   * ──────────────────────────────── */
  async updatePaymentData(
    sessionId: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    try {
      const intent = await this.stripe.paymentIntents.update(sessionId, {
        metadata: { ...data },
      })
      return { id: intent.id, status: intent.status }
    } catch (e: any) {
      return { error: e.message }
    }
  }

  /* ────────────────────────────────
   * 9. DELETE (poco usual con Stripe)
   * ──────────────────────────────── */
  async deletePayment(): Promise<Record<string, unknown>> {
    return {}
  }

  /* ────────────────────────────────
   * 10. RETRIEVE (devuelve la data cruda)
   * ──────────────────────────────── */
  async retrievePayment(
    paymentSessionData: Record<string, unknown>
  ): Promise<Record<string, unknown> | PaymentProcessorError> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(
        paymentSessionData.id as string
      )
      return intent as unknown as Record<string, unknown>
    } catch (e: any) {
      return { error: e.message }
    }
  }
}

export default StripePaymentService

export const AUTHENTICATE = false