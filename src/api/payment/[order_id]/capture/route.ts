import CryptoJS from 'crypto-js';
import type {
    MedusaRequest,
    MedusaResponse,
} from "@medusajs/medusa"

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
) {

    const order_id = req.params.order_id;

    const STATUS_ENUM = {
        1: 'pendiente de pago',
        2: 'pagada',
        3: 'rechazada',
        4: 'anulada'
    }

    try {
        const optionsAdmin = {
            method: 'GET',
            headers: {
                'x-medusa-access-token': process.env.API_KEY_MEDUSA
            }
        };

        const options = {
            method: 'GET'
        };
        //Step 1 get Order
        const orderResult = await fetch(`${process.env.MEDUSA_ADMIN_BACKEND_URL}/admin/orders/${order_id}`, optionsAdmin);

        const responseOrder = await orderResult.json();

        //Step 2 get cart for payment

        const cart_id = responseOrder.order.payments[0].cart_id;

        const cartResult = await fetch(`${process.env.MEDUSA_ADMIN_BACKEND_URL}/store/carts/${cart_id}`, optionsAdmin)

        const responseCart = await cartResult.json();

        const urlToPay = responseCart.cart.payment_sessions.find(payment => payment.provider_id === 'flow-payment')?.data.urlToPay;

        const tokenIndex = urlToPay.indexOf("token=");

        const token = urlToPay.substring(tokenIndex + "token=".length);

        //Step 3 get flow order id

        let object = "apiKey=" + process.env.API_KEY_FLOW_PAYMENT + "&token=" + token;

        let sign = CryptoJS.HmacSHA256(object, process.env.SECRET_KEY_FLOW_PAYMENT);

        let url = `${process.env.FLOW_URL}/payment/getStatus` + "?" + object + "&s=" + sign;

        let responseGetStatus = await fetch(url, options);

        const detailStatus = await responseGetStatus.json();

        if (detailStatus.code) {
            return res.json(detailStatus);
        }

        if(detailStatus.status === 2) {
            //Si fue pagado se avisa a medusa para captura el pago manualmentea
            const optionsPostAdmin = {
                method: 'POST',
                headers: {
                    'x-medusa-access-token': process.env.API_KEY_MEDUSA
                },
            };
    
            const orderCaptureResult = await fetch(`${process.env.MEDUSA_ADMIN_BACKEND_URL}/admin/orders/${order_id}/capture`, optionsPostAdmin);
    
            const orderDetailStatus = await orderCaptureResult.json();
    
            return res.json({
                message: 'payment capture successful',
                amount: orderDetailStatus.order.total,
                status: STATUS_ENUM[detailStatus.status]
            })
        }

        return res.json({
            message: 'payment not capture',
            status: STATUS_ENUM[detailStatus.status]
        })

    } catch (err) {
        console.log(err)
        return {
            message: 'Error al capturar el pago',
            detail: err
        }
    }
}


