import axios from 'axios';
import { env } from '../config/env.js';

/**
 * Verifies a transaction reference directly with Paystack REST API.
 * @param {string} reference - Paystack payment reference string
 * @returns {Promise<Object>} Paystack transaction data object
 */
export const verifyPaystackTransaction = async (reference) => {
  const secretKey = env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured in environment variables');
  }

  // Simulated test reference fallback strictly restricted to isolated automated test runs
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.ALLOW_PAYSTACK_TEST_MOCK === 'true' &&
    reference &&
    reference.startsWith('PAYSTACK_TEST_REF_')
  ) {
    return {
      status: 'success',
      amount: 1500000, // 15,000 NGN in Kobo
      currency: 'NGN',
      reference: reference,
      gateway_response: 'Successful',
      paid_at: new Date().toISOString(),
    };
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.data && response.data.status === true) {
      return response.data.data;
    } else {
      throw new Error(response.data?.message || 'Paystack verification failed');
    }
  } catch (error) {
    if (error.response?.data?.message) {
      throw new Error(`Paystack API Error: ${error.response.data.message}`);
    }
    throw error;
  }
};

/**
 * Initializes a Paystack transaction for institution subscriptions.
 * @param {Object} params - { email, amount, currency, plan, billing, institutionId, grossAmount, discount }
 * @returns {Promise<Object>} { reference, access_code, checkoutUrl }
 */
export const initializeSubscriptionTransaction = async ({
  email,
  amount,
  currency = 'USD',
  plan,
  billing,
  institutionId,
  grossAmount,
  discount = 0,
}) => {
  const secretKey = env.PAYSTACK_SECRET_KEY;
  const reference = `PAYSTACK_SUB_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // If secret key is not configured or in test mode, return robust simulated response
  if (!secretKey || secretKey.startsWith('sk_test_mock') || process.env.NODE_ENV === 'test') {
    return {
      reference,
      access_code: `mock_access_${Date.now()}`,
      checkoutUrl: `https://checkout.paystack.com/mock_sub_${reference}`,
    };
  }

  try {
    const amountInSubunit = Math.round(amount * 100); // Cents for USD, Kobo for NGN
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: amountInSubunit,
        currency,
        reference,
        metadata: {
          type: 'institution_subscription',
          institutionId: String(institutionId),
          plan,
          billing,
          amountGross: grossAmount || amount,
          discount,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.data && response.data.status === true) {
      return {
        reference,
        access_code: response.data.data.access_code,
        checkoutUrl: response.data.data.authorization_url,
      };
    } else {
      throw new Error(response.data?.message || 'Paystack transaction initialization failed');
    }
  } catch (error) {
    // If Paystack fails (e.g. USD not enabled on test key), fall back gracefully in test/dev
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[PAYSTACK DEV FALLBACK] ${error.message}. Returning simulated checkout reference.`);
      return {
        reference,
        access_code: `mock_access_${Date.now()}`,
        checkoutUrl: `https://checkout.paystack.com/mock_sub_${reference}`,
      };
    }
    if (error.response?.data?.message) {
      throw new Error(`Paystack API Error: ${error.response.data.message}`);
    }
    throw error;
  }
};

export default {
  verifyPaystackTransaction,
  initializeSubscriptionTransaction,
};
