import CryptoJS from 'crypto-js';

import {
    AbstractPaymentProcessor,
    PaymentProcessorError,
    PaymentSessionStatus,
    PaymentProviderService,
    PaymentProcessorSessionResponse,
    PaymentProcessorContext
} from "@medusajs/medusa";

class FlowPaymentService extends AbstractPaymentProcessor {

    static identifier = "flow-payment";
    protected paymentProviderService: PaymentProviderService
    static FlowUrl = process.env.FLOW_URL || "https://sandbox.flow.cl/api"

    constructor(container, options) {
        super(container);
        this.paymentProviderService = container.paymentProviderService;

    }

    async capturePayment(
        paymentSessionData: Record<string, unknown>
    ): Promise<Record<string, unknown> | PaymentProcessorError> {
        
       return {
        paymentSessionData
      };
    }

    async authorizePayment(
        paymentSessionData: Record<string, unknown>,
        context: Record<string, unknown>
    ): Promise<
        PaymentProcessorError |
        {
            status: PaymentSessionStatus;
            data: Record<string, unknown>;
        }
    > {
        try {

            return {
                status: PaymentSessionStatus.AUTHORIZED,
                data: {
                    paymentSessionData
                }
            }

        } catch (e) {
            return {
                error: e.message
            }
        }
    }

    async cancelPayment(
        paymentSessionData: Record<string, unknown>
    ): Promise<Record<string, unknown> | PaymentProcessorError> {
        const paymentId = paymentSessionData.id

        return {
            id: paymentId
        }
    }

    async initiatePayment(
        context: PaymentProcessorContext
    ): Promise<
        PaymentProcessorError | PaymentProcessorSessionResponse
    > {

        return {
            session_data: {
                id: 'flow-payment',
                provider_id: 'flow-payment',
                amount: context.amount,
                cart_id: context.resource_id,
                created_at: new Date(),
                data: {
                    customer: context.customer
                },
                idempotency_key: null,
                is_initiated: true,
                is_selected: true,
                payment_authorized_at: null,
                status: "pending",
                updated_at: new Date()
            }
        }

    }

    async deletePayment(
        paymentSessionData: Record<string, unknown>
    ): Promise<Record<string, unknown> | PaymentProcessorError> {
        const paymentId = paymentSessionData.id
        // assuming client is an initialized client
        // communicating with a third-party service.

        return {}
    }

    async getPaymentStatus(
        paymentSessionData: Record<string, unknown>
    ): Promise<PaymentSessionStatus> {
        const paymentId = paymentSessionData.id

        // assuming client is an initialized client
        // communicating with a third-party service.
        return await 'authorized' as PaymentSessionStatus
    }

    async refundPayment(
        paymentSessionData: Record<string, unknown>,
        refundAmount: number
    ): Promise<Record<string, unknown> | PaymentProcessorError> {
        const paymentId = paymentSessionData.id

        // assuming client is an initialized client
        // communicating with a third-party service.

        return {
            id: paymentId
        }
    }

    async retrievePayment(
        paymentSessionData: Record<string, unknown>
    ): Promise<Record<string, unknown> | PaymentProcessorError> {
        return paymentSessionData
    }

    async updatePayment(
        context: PaymentProcessorContext
    ): Promise<
        void |
        PaymentProcessorError |
        PaymentProcessorSessionResponse
    > {
        // assuming client is an initialized client
        // communicating with a third-party service.
        const paymentId = context.paymentSessionData.id

        return {
            session_data: context.paymentSessionData
        }
    }

    async updatePaymentData(
        sessionId: string,
        data: Record<string, unknown>
    ): Promise<
        Record<string, unknown> |
        PaymentProcessorError
    > {

        const params = {
            apiKey: process.env.API_KEY_FLOW_PAYMENT,
            subject: 'Pago-de-prueba-POSTMAN',
            currency: 'CLP',
            amount: data.amount.toString(),
            commerceOrder: data.order_id.toString(),
            email: data.email.toString(),
            urlConfirmation: `${process.env.MEDUSA_ADMIN_BACKEND_URL}/payment/${data.order_id}/capture`,
            urlReturn: `${process.env.URL_STORE}/order/confirmed/${data.order_id}`
        };

        const sortedParams = Object.keys(params)
            .sort()
            .map(key => key + params[key])
            .join('');

        const signature = CryptoJS.HmacSHA256(sortedParams, process.env.SECRET_KEY_FLOW_PAYMENT);

        const formData = new FormData();

        formData.append('apiKey', params.apiKey);
        formData.append('subject', params.subject);
        formData.append('currency', params.currency);
        formData.append('amount', params.amount);
        formData.append('email', params.email);
        formData.append('commerceOrder', params.commerceOrder);
        formData.append('urlConfirmation', params.urlConfirmation);
        formData.append('urlReturn', params.urlReturn);
        formData.append('s', signature);

        const options = {
            method: 'POST',
            body: formData
        };

        try {

            const endpointCreatePayment = '/payment/create';

            const result = await fetch(`${process.env.FLOW_URL}${endpointCreatePayment}`, options);

            const responseData = await result.json();

            if (responseData?.code) {
                console.log(responseData)
                return {
                    error: 'Failed to authorized payment'
                };
            }

            const { token, flowOrder, url } = responseData;

            return {
                flow_order_id: flowOrder,
                urlToPay: `${url}?token=${token}`
            }

        } catch (error) {
            console.error('Error initiating payment:', error);
            return { error: 'Failed to initiate payment' };
        }
    }

}

export default FlowPaymentService;

export const AUTHENTICATE = false