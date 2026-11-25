// Páginas provisórias da F01: F02 substitui /organizer e F04 substitui /.
import { Router } from 'express';
import { requireOrganizer } from './auth/guards.js';

export const placeholderRouter = Router();
placeholderRouter.get('/', (req, res) => res.render('home/index', { title: 'Vitrine' }));
placeholderRouter.get('/organizer', requireOrganizer, (req, res) => res.render('organizer/placeholder', { title: 'Meus eventos' }));
