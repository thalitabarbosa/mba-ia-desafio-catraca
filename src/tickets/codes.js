import { randomString } from '../ids.js';

// Sem 0/O/1/I para evitar confusão na portaria.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newTicketCode = () => randomString(8, CODE_ALPHABET);
