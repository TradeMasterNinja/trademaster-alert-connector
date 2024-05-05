import { AlertObject, dydxV4OrderParams } from '../../types';
import 'dotenv/config';
import { getStrategiesDB } from '../../helper';
import { OrderSide } from '@dydxprotocol/v4-client-js';
import { dydxV4GetAccount } from './getAccount';

export const dydxV4BuildOrderParams = async (alertMessage: AlertObject) => {
	const [db, rootData] = getStrategiesDB();
	const market = alertMessage.market.replace(/_/g, '-');
	const { isReady, account, perpPositions, assetPositions } = await dydxV4GetAccount();
	const currentPosition = perpPositions.find(
		(position) => position.market == market
	);
	const orderSide =
		alertMessage.order == 'buy' ? OrderSide.BUY : OrderSide.SELL;
	const positionSide = alertMessage.position == 'long' ? 'LONG' : 'SHORT';
	
	
	const latestPrice = alertMessage.price;
	console.log('latestPrice', latestPrice);

	let orderSize: number = 0;
	
	// Add current position size if alert is in opposite direction
	if (currentPosition && currentPosition.side == "LONG" && orderSide == OrderSide.SELL && positionSide == "SHORT"){
		orderSize = Math.abs(currentPosition.size);
	}
	if (currentPosition && currentPosition.side == "SHORT" && orderSide == OrderSide.BUY && positionSide == "LONG"){
		orderSize = Math.abs(currentPosition.size);
	}


	if (alertMessage.sizeByLeverage) {
		// const { isReady, account, perpPositions, assetPositions } = await dydxV4GetAccount();

		orderSize = orderSize + (account.equity * Number(alertMessage.sizeByLeverage)) / latestPrice;
	} else if (alertMessage.sizeUsd) {
		orderSize = orderSize + Number(alertMessage.sizeUsd) / latestPrice;
	} else if (
		alertMessage.reverse &&
		rootData[alertMessage.strategy].isFirstOrder == 'false'
	) {
		orderSize = orderSize + alertMessage.size;
	} else {
		// probably creating a new order || order in same direction || or reduce only order
		orderSize = currentPosition.size;
	}
	// validate order size
	const validSize = ( Math.abs(Number(currentPosition.size)) - Number(orderSize) ) >= 0;
	if (!validSize && !alertMessage.reverse) {
		orderSize = currentPosition.size;
	}
	
	const orderParams: dydxV4OrderParams = {
		market,
		side: orderSide,
		size: Number(orderSize),
		price: Number(alertMessage.price)
	};
	console.log('perpPositions', perpPositions);
	console.log('currentPosition', currentPosition);
	console.log('orderParams for dydx', orderParams);
	return orderParams;
};
