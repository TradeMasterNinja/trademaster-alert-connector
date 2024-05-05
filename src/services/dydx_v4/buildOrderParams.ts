import { AlertObject, dydxV4OrderParams } from '../../types';
import 'dotenv/config';
import { getStrategiesDB } from '../../helper';
import { OrderSide } from '@dydxprotocol/v4-client-js';
import { dydxV4GetAccount } from './getAccount';

export const dydxV4BuildOrderParams = async (alertMessage: AlertObject) => {
	const [db, rootData] = getStrategiesDB();
	const market = alertMessage.market.replace(/_/g, '-');
	const { isReady, account, openPositions } = await dydxV4GetAccount();
	const currentPosition = openPositions.find(
		(position) => position.market == market
	);

	const currentPositionSize = currentPosition.size ? Number(Math.abs(currentPosition.size)) : 0;
	const orderSide =
		alertMessage.order == 'buy' ? OrderSide.BUY : OrderSide.SELL;
	const positionSide = alertMessage.position == 'long' ? 'LONG' : 'SHORT';
	
	
	const latestPrice = Number(alertMessage.price);
	let orderSize: number = 0;
	
	// Add current position size if alert is in opposite direction
	if (currentPosition && currentPosition.side == "LONG" && orderSide == OrderSide.SELL && positionSide == "SHORT"){
		orderSize = currentPositionSize;
	}
	if (currentPosition && currentPosition.side == "SHORT" && orderSide == OrderSide.BUY && positionSide == "LONG"){
		orderSize = currentPositionSize;
	}


	if (alertMessage.sizeByLeverage) {

		orderSize = orderSize + (account.equity * Number(alertMessage.sizeByLeverage)) / latestPrice;
	} else if (alertMessage.sizeUsd) {
		orderSize = orderSize + Number(alertMessage.sizeUsd) / latestPrice;
	} else if (
		alertMessage.reverse &&
		rootData[alertMessage.strategy].isFirstOrder == 'false'
	) {
		orderSize = orderSize + Number(alertMessage.size);
	} else {
		// probably creating a new order || order in same direction || or reduce only order
		orderSize = Number(alertMessage.size);
	}
	// validate order size
	const validSize = (Math.abs(currentPositionSize) - orderSize) >= 0;
	if (validSize === false && alertMessage.reverse === false) {
		orderSize = currentPositionSize;
	}

	const orderParams: dydxV4OrderParams = {
		market,
		side: orderSide,
		size: orderSize,
		price: latestPrice
	};
	console.log('latestPrice', latestPrice);
	console.log('validSize', validSize);
	console.log('openPerpPositions', account.openPerpetualPositions);
	console.log('currentPosition', currentPosition);
	console.log('orderParams for dydx', orderParams);
	return orderParams;
};
