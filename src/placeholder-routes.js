// Página provisória da F01: a vitrine real (/) vem na F04.
import { Router } from 'express';

export const placeholderRouter = Router();
placeholderRouter.get('/', (req, res) => res.render('home/index', { title: 'Vitrine' }));
