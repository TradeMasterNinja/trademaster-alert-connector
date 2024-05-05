import { AlertObject, dydxV4OrderParams } from '../../types';
import 'dotenv/config';
import { getStrategiesDB } from '../../helper';
import { OrderSide } from '@dydxprotocol/v4-client-js';
import { dydxV4GetAccount } from './getAccount';

export const dydxV4BuildOrderParams = async (alertMessage: AlertObject) => {
    try {
        const [db, rootData] = getStrategiesDB();
        const market = alertMessage.market.replace(/_/g, '-');
        const accountData = await dydxV4GetAccount();
        
        if (!accountData.isReady || !accountData.account || !accountData.openPositions) {
            throw new Error('Failed to fetch account data.');
        }

        const { account, openPositions } = accountData;    
        const currentPosition = openPositions[market];

        const currentPositionSize = currentPosition.size ? Math.abs(Number(currentPosition.size)) : 0;
        const orderSide = alertMessage.order === 'buy' ? OrderSide.BUY : OrderSide.SELL;
        const positionSide = alertMessage.position === 'long' ? 'LONG' : 'SHORT';
		const reduceOrder = (orderSide===OrderSide.BUY && positionSide==="SHORT") || (orderSide===OrderSide.SELL && positionSide==="LONG");
        const latestPrice = Number(alertMessage.price);
        let orderSize: number = 0;
           
        // populate orderSize full current position size if alert side is in opposite direction of current open position
        if (currentPosition && currentPosition.side === "LONG" && orderSide === OrderSide.SELL && !reduceOrder) {
            orderSize = currentPositionSize;
        }
        if (currentPosition && currentPosition.side === "SHORT" && orderSide === OrderSide.BUY && !reduceOrder) {
            orderSize = currentPositionSize;
        }
        
        if (alertMessage.sizeByLeverage) {
			if (reduceOrder) {
				orderSize = ((currentPositionSize*latestPrice) * Number(alertMessage.sizeByLeverage)) / latestPrice;
			} else {
				orderSize += (account.equity * Number(alertMessage.sizeByLeverage)) / latestPrice;
			}
        } else if (alertMessage.sizeUsd) {
			if (reduceOrder) {
				const sizeUsd = currentPositionSize - (Number(alertMessage.sizeUsd) / latestPrice);
				orderSize = sizeUsd < 0 ? currentPositionSize : sizeUsd
			} else {
				orderSize += Number(alertMessage.sizeUsd) / latestPrice;
			}
            
        } else if (alertMessage.reverse && rootData[alertMessage.strategy].isFirstOrder === 'false') {
            orderSize = currentPositionSize + Number(alertMessage.size);
        } else {
            orderSize += Number(alertMessage.size);
        }

        const orderParams: dydxV4OrderParams = {
            market,
            side: orderSide,
            size: Number(orderSize),
            price: Number(latestPrice)
        };

		console.log('---openPerpPositions---\n', openPositions);
        console.log('---currentPosition---\n', currentPosition);   
        console.log('orderParams for dydx\n', orderParams);
        
        return orderParams;
    } catch (error) {
        console.error('Error in dydxV4BuildOrderParams:', error);
        // You can handle or re-throw the error as needed
        throw error;
    }
};

