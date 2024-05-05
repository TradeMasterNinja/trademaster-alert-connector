import { AlertObject, dydxV4OrderParams } from '../../types';
import 'dotenv/config';
//import { getStrategiesDB } from '../../helper';
import { OrderSide } from '@dydxprotocol/v4-client-js';
import { dydxV4GetAccount } from './getAccount';

export const dydxV4BuildOrderParams = async (alertMessage: AlertObject) => {
    try {
        //const [db, rootData] = getStrategiesDB();
        const market = alertMessage.market.replace(/_/g, '-');
        const accountData = await dydxV4GetAccount();
        
        if (!accountData.isReady || !accountData.account || !accountData.openPositions) {
            throw new Error('Failed to fetch account data.');
        }

        const orderSide = alertMessage.order === 'buy' ? OrderSide.BUY : OrderSide.SELL;
        const positionSide = alertMessage.position === 'long' ? 'LONG' : 'SHORT';
		const reduceOrder = (orderSide===OrderSide.BUY && positionSide==="SHORT") || (orderSide===OrderSide.SELL && positionSide==="LONG");
		const { account, openPositions } = accountData;    
        const currentPosition = openPositions[market];
		//check if user already manually closed position
		if (!currentPosition && reduceOrder) {
			throw new Error('cannot reduce '+market+' order. Position has already been closed or does not exist');
		}
        const currentPositionSize = currentPosition ? Math.abs(Number(currentPosition.size)) : 0;
		const latestPrice = Number(alertMessage.price);
        const alertSize = alertMessage.sizeByLeverage ? Number(alertMessage.sizeByLeverage) : alertMessage.sizeUsd ? Number(alertMessage.sizeUsd) : alertMessage.size ? Number(alertMessage.size) : 0;
		console.log("alertSize", alertSize);
		let orderSize: number = (alertMessage.reverse && currentPosition.side !== positionSide) ? currentPositionSize : 0;

        // populate orderSize full current position size if alert side is in opposite direction of current open position
        if (currentPosition && currentPosition.side === "LONG" && orderSide === OrderSide.SELL && !reduceOrder) {
            orderSize = currentPositionSize;
        }
        if (currentPosition && currentPosition.side === "SHORT" && orderSide === OrderSide.BUY && !reduceOrder) {
            orderSize = currentPositionSize;
        }
        
        if (alertMessage.sizeByLeverage) {
			if (reduceOrder) {
                const sizeUsd = ((currentPositionSize*latestPrice) * alertSize) / latestPrice;
                orderSize = sizeUsd >= currentPositionSize ? currentPositionSize : sizeUsd
			} else {
				orderSize += (account.equity * alertSize) / latestPrice;
			}
        } else if (alertMessage.sizeUsd) {
			if (reduceOrder) {
				const sizeUsd = alertSize / latestPrice;
				orderSize = sizeUsd >= currentPositionSize ? currentPositionSize : sizeUsd
			} else {
				orderSize += alertSize / latestPrice;
			}
            
        }  else {
            if (reduceOrder) {
                orderSize = alertSize >= currentPositionSize ? currentPositionSize : alertSize
            } else {
                orderSize += alertSize;
            }
            
        }

        const orderParams: dydxV4OrderParams = {
            market,
            side: orderSide,
            size: Number(orderSize),
            price: Number(latestPrice)
        };

		console.log('---openPerpPositions---\n', openPositions); 
        console.log('orderParams for dydx\n', orderParams);
        
        return orderParams;
    } catch (error) {
        console.error('Error in dydxV4BuildOrderParams:', error);
        // You can handle or re-throw the error as needed
        throw error;
    }
};

