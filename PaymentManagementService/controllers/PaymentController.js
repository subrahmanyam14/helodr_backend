// controllers/PaymentController.js

const paypalClient = require("../utils/PaypalClient");
const Payment = require("../models/Payment");
const Transaction = require("../models/Transaction");

const checkoutNodeJssdk = require("@paypal/checkout-server-sdk");

exports.processPaypalPayment = async (req, res) => {
    const { appointmentId, doctorId, patientId, amount } = req.body;

    const session = await Payment.startSession();
    session.startTransaction();

    try {
        // Calculate GST and Total
        const gstAmount = amount * 0.18;
        const totalAmount = amount + gstAmount;

        // 1. Create a PayPal order
        const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: "CAPTURE",
            purchase_units: [{
                amount: {
                    currency_code: "USD",
                    value: totalAmount.toFixed(2)
                }
            }]
        });

        const order = await paypalClient.execute(request);

        // 2. Capture payment
        const captureRequest = new checkoutNodeJssdk.orders.OrdersCaptureRequest(order.result.id);
        captureRequest.requestBody({});
        const capture = await paypalClient.execute(captureRequest);

        const captureId = capture.result.purchase_units[0].payments.captures[0].id;

        // 3. Store payment in DB
        const payment = await Payment.create([{
            appointment: appointmentId,
            doctor: doctorId,
            patient: patientId,
            amount,
            gstamount: gstAmount,
            totalamount: totalAmount,
            status: "captured",
            paymentMethod: "online",
            gateway: {
                name: "paypal",
                transactionId: captureId,
                referenceId: order.result.id
            }
        }], { session });

        // 4. Create transaction
        await Transaction.create([{
            user: patientId,
            type: "appointment_payment",
            amount: totalAmount,
            referenceId: payment[0]._id,
            referenceType: "Payment",
            status: "completed",
            notes: `Payment for appointment ${appointmentId}`
        }], { session });

        // 5. Create notifications
        await Notification.create([
            {
                referenceId: appointmentId,
                user: patientId,
                message: "Appointment confirmed",
                type: "payment"
            },
            {
                referenceId: appointmentId,
                user: doctorId,
                message: "Appointment scheduled",
                type: "payment"
            }
        ], { session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: "Payment successful",
            payment: payment[0],
            paypalOrderId: order.result.id,
            paypalCaptureId: captureId
        });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error("PayPal payment error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
