import axios, { isAxiosError } from 'axios';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
  console.warn('PAYSTACK_SECRET_KEY is not defined in environment variables');
}

export const initializePayment = async (email: string, amount: number, metadata?: any) => {
  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: Math.round(amount * 100), // Paystack works in kobo
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#paystack-callback`,
        metadata: metadata || {}
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Paystack initialize error:', error);
    throw new Error('Failed to initialize Paystack payment');
  }
};

export const verifyPayment = async (reference: string) => {
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Paystack verify error:', error);
    throw new Error('Failed to verify Paystack payment');
  }
};

export const getBanks = async () => {
  try {
    const response = await axios.get('https://api.paystack.co/bank?country=nigeria', {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Paystack getBanks error:', error);
    throw new Error('Failed to fetch banks from Paystack');
  }
};

export const resolveAccountNumber = async (accountNumber: string, bankCode: string) => {
  try {
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Paystack resolveAccountNumber error:', error);
    if (isAxiosError(error) && error.response) {
      return error.response.data;
    }
    throw new Error('Failed to resolve account number via Paystack');
  }
};
