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
        const currentPosition = openPositions.find(
            (position) => position.market === market
        );

        const currentPositionSize = currentPosition ? Math.abs(Number(currentPosition.size)) : 0;
        const orderSide = alertMessage.order === 'buy' ? OrderSide.BUY : OrderSide.SELL;
        const positionSide = alertMessage.position === 'long' ? 'LONG' : 'SHORT';
        const latestPrice = Number(alertMessage.price);
        let orderSize: number = 0;
        
        console.log('---openPerpPositions---', openPositions);
        console.log('---currentPosition---', currentPosition);
        console.log('---currentPositionSize---', currentPositionSize);
        
        // Add current position size if alert is in opposite direction
        if (currentPosition && currentPosition.side === "LONG" && orderSide === OrderSide.SELL && positionSide === "SHORT") {
            orderSize = currentPositionSize;
        }
        if (currentPosition && currentPosition.side === "SHORT" && orderSide === OrderSide.BUY && positionSide === "LONG") {
            orderSize = currentPositionSize;
        }
        
        if (alertMessage.sizeByLeverage) {
            orderSize += (account.equity * Number(alertMessage.sizeByLeverage)) / latestPrice;
        } else if (alertMessage.sizeUsd) {
            orderSize += Number(alertMessage.sizeUsd) / latestPrice;
        } else if (alertMessage.reverse && rootData[alertMessage.strategy].isFirstOrder === 'false') {
            orderSize += Number(alertMessage.size);
        } else {
            orderSize = Number(alertMessage.size);
        }
        
        // validate order size
        const validSize = (Math.abs(currentPositionSize) - orderSize) >= 0;
        
        if (!validSize && !alertMessage.reverse) {
            orderSize = currentPositionSize;
        }
        
        const orderParams: dydxV4OrderParams = {
            market,
            side: orderSide,
            size: Number(orderSize),
            price: Number(latestPrice)
        };
        
        console.log('latestPrice', latestPrice);
        console.log('validSize', validSize);
        console.log('orderParams for dydx', orderParams);
        
        return orderParams;
    } catch (error) {
        console.error('Error in dydxV4BuildOrderParams:', error);
        // You can handle or re-throw the error as needed
        throw error;
    }
};

