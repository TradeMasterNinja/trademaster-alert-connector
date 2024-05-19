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

        const positionSide = alertMessage.position === 'long' ? 'LONG' : alertMessage.position === 'short' ? 'SHORT' : 'FLAT';
		const { account, openPositions } = accountData;    
        const currentPosition = openPositions[market];
        const orderSide : OrderSide = alertMessage.order === 'buy' ? OrderSide.BUY : OrderSide.SELL;
        const reduceOrder = (orderSide===OrderSide.BUY && positionSide==="SHORT") || (orderSide===OrderSide.SELL && positionSide==="LONG");
		
		//check if user already manually closed position
		if (!currentPosition && reduceOrder) {
			throw new Error('cannot reduce '+market+' order. Position has already been closed or does not exist');
		}
        if (!currentPosition && positionSide === "FLAT") {
			throw new Error('cannot close '+market+' order. Position has already been closed or does not exist');
		}

        // calculate current positionSize
        const currentPositionSize = currentPosition ? Math.abs(Number(currentPosition.size)) : 0;
        const alertSize = alertMessage.sizeByLeverage ? Number(alertMessage.sizeByLeverage) : alertMessage.sizeUsd ? Number(alertMessage.sizeUsd) : alertMessage.size ? Number(alertMessage.size) : 0;
		const latestPrice = Number(alertMessage.price)
        const newOrder = {
            orderSize:Number((alertMessage.reverse && currentPosition && currentPosition.side !== positionSide) ? currentPositionSize : 0),
            orderSide:orderSide
        }

        // calculate new orderSize
        if (positionSide === "FLAT") {
            // market close current order
            newOrder.orderSize = currentPositionSize;
            newOrder.orderSide = currentPosition.side === "LONG" ? OrderSide.SELL : OrderSide.BUY;
        } else {
            // use full current position size if alert side is in opposite direction of current open position
            if (currentPosition && currentPosition.side === "LONG" && orderSide === OrderSide.SELL && !reduceOrder) {
                newOrder.orderSize = currentPositionSize;
            }
            if (currentPosition && currentPosition.side === "SHORT" && orderSide === OrderSide.BUY && !reduceOrder) {
                newOrder.orderSize = currentPositionSize;
            }
            
            if (alertMessage.sizeByLeverage) {
                if (reduceOrder) {
                    const sizeUsd = ((currentPositionSize*latestPrice) * alertSize) / latestPrice;
                    newOrder.orderSize = sizeUsd >= currentPositionSize ? currentPositionSize : sizeUsd
                    console.log("sizeByLeverage reduce order", newOrder.orderSize)
                } else {
                    newOrder.orderSize += (account.equity * alertSize) / latestPrice;
                    console.log("sizeByLeverage order", newOrder.orderSize)
                }
            } else if (alertMessage.sizeUsd) {
                if (reduceOrder) {
                    const sizeUsd = alertSize / latestPrice;
                    newOrder.orderSize = sizeUsd >= currentPositionSize ? currentPositionSize : sizeUsd
                    console.log("sizeUSD reduce order", newOrder.orderSize)
                } else {
                    newOrder.orderSize += alertSize / latestPrice;
                    console.log("sizeUSD order", newOrder.orderSize)
                }
                
            }  else {
                if (reduceOrder) {
                    newOrder.orderSize = alertSize >= currentPositionSize ? currentPositionSize : alertSize
                    console.log("size reduce order", newOrder.orderSize)
                } else {
                    newOrder.orderSize += alertSize;
                    console.log("size order", newOrder.orderSize)
                }
                
            }
        }
             
        const orderParams: dydxV4OrderParams = {
            market,
            side: newOrder.orderSide,
            size: Number(newOrder.orderSize),
            price: Number(latestPrice),
            trdmAlert: alertMessage.trdmAlert,
            ...(alertMessage.limitOrderSeconds && { limitOrderSeconds: alertMessage.limitOrderSeconds }),
            ...(alertMessage.limitOrderAttempts && { limitOrderAttempts: alertMessage.limitOrderAttempts })
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

