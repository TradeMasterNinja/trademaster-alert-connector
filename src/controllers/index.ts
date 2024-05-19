import express, { Router } from 'express';
import {
	validateAlert,
	dydxV4CreateOrder
} from '../services';
import { dydxV4BuildOrderParams } from '../services/dydx_v4/buildOrderParams';
//import { dydxV4ExportOrder } from '../services/dydx_v4/exportOrder';
import { dydxV4GetAccount } from '../services/dydx_v4/getAccount';

const router: Router = express.Router();

router.get('/', async (req, res) => {
	console.log('Recieved GET request.');

	const dydxV4Account = await dydxV4GetAccount();

	if (!dydxV4Account) {
		res.send('Error on getting account data');
	} else {
		const message =
			'dYdX v4 Account Ready:' +
			dydxV4Account?.isReady
		res.send(message);
	}
});

router.post('/', async (req, res) => {
	console.log('Recieved Tradingview strategy alert:', req.body);

	const validated = await validateAlert(req.body);
	if (!validated) {
		return res.status(400).send('Error: Alert message is not valid');
	}
	// Respond with a 200 status indicating that the request was received and validated
    res.status(200).send('Alert message is valid. Processing request...');

	// process order
	try {
		let orderResult;

		const exchange = req.body['exchange'].toLowerCase();
		switch (exchange) {
			case 'dydxv4': {
				const orderParams = await dydxV4BuildOrderParams(req.body);
				if (!orderParams) return;
				orderResult = await dydxV4CreateOrder(orderParams);
				if (!orderResult) throw Error('Order is not executed');
				// await dydxV4ExportOrder(
				// 	req.body['strategy'],
				// 	orderResult,
				// 	req.body['price'],
				// 	req.body['market']
				// );
				break;
			}
			default: {
				const orderParams = await dydxV4BuildOrderParams(req.body);
				if (!orderParams) return;
				orderResult = await dydxV4CreateOrder(orderParams);
				if (!orderResult) throw Error('Order is not executed');
				// await dydxV4ExportOrder(
				// 	req.body['strategy'],
				// 	orderResult,
				// 	req.body['price'],
				// 	req.body['market']
				// );
			}
		}
		// Respond with orderResult
        //return res.status(200).send(orderResult);
    } catch (e) {
        console.error('Error processing request:', e);
        //return res.status(500).send('Error processing request');
    }
	
});

router.get('/debug-sentry', function mainHandler(req, res) {
	throw new Error('My first Sentry error!');
});

export default router;