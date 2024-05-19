import {
	OrderExecution,
	OrderSide,
	OrderTimeInForce,
	OrderType,
	OrderFlags
} from '@dydxprotocol/v4-client-js';
import { dydxV4OrderParams } from '../../types';
import {
	dydxV4Client,
	dydxV4IndexerClient,
	generateLocalWallet
} from './client';
import { _sleep } from '../../helper';
import 'dotenv/config';

export const dydxV4CreateOrder = async (orderParams: dydxV4OrderParams) => {
	const { client, subaccount } = await dydxV4Client();
	const clientIndexer = dydxV4IndexerClient();
	const market = orderParams.market;		
	const size = Number(orderParams.size);
	const side = orderParams.side;
	const marketOrderTimeout = !process.env.MARKET_ORDER_FILL_TIMEOUT ? 15000 : Number(process.env.MARKET_ORDER_FILL_TIMEOUT);
	const marketOrderMaxRetries = !process.env.MARKET_ORDER_MAX_RETRIES ? 2 : Number(process.env.MARKET_ORDER_MAX_RETRIES);
	
	const doLimitOrder = async (
		amountFilled: number,
		remaining: number,
		fillWaitTime: number,
		maxAttempts: number,
		reduceOnly = false
	) =>{
		console.log('Attempting to place Limit order:');
		const orderType = "LIMIT ORDER"
		let count = maxAttempts;
		let totalFilled = amountFilled;
		let remainingOrderSize = remaining;
		while (count > 0) {
			console.log('Place order attempt:', maxAttempts - count + 1, 'of', maxAttempts);
			const isShortTerm = fillWaitTime < 20000;
			const book = await clientIndexer.markets.getPerpetualMarketOrderbook(market);
			// Get the best bid and ask prices
			const bestBidPrice = book.bids[isShortTerm ? 0 : 1].price;
			const bestAskPrice = book.asks[isShortTerm ? 0 : 1].price;
			// Calculate the spread percentage
			const spreadPercentage = ((bestAskPrice - bestBidPrice) / bestBidPrice) * 100;
			const withinSpread = Math.abs(spreadPercentage) <= 0.01;
			//const shortBlock = 20;		
			const clientId = generateRandomInt32();
			const txOrders = [];
			console.log('Client ID: ', clientId);
			const block = await clientIndexer.utility.getHeight();	
			console.log('Block Height: ', block.height);		
			const nextValidBlockHeight = Number(block.height) + 1;
			const goodUntilBlock = nextValidBlockHeight + (fillWaitTime / 1000);
			const openBlock = Number(block.height);
			let tx;	
			if (totalFilled <= size) {
				// place a limit order		
				try {
					//const postOnly = true //orderParams.postOnly ?? false;
					const price = side === OrderSide.BUY ? book.bids[withinSpread ? 1 : 0].price : book.asks[withinSpread ? 1 : 0].price;
					console.log('--- NEW LIMIT ORDER: ---', side+' Limit Price: ', price, 'Order Size: ', remainingOrderSize, 'Reduce Only: ',reduceOnly);
					if (isShortTerm) {
						// place a short term order
						tx = await client.placeShortTermOrder(
							subaccount,
							market,
							side,
							price,
							remainingOrderSize,
							clientId,
							goodUntilBlock,
							OrderTimeInForce.GTT,
							reduceOnly,
						);
					} else {
						// place a long term order
						const fillSecond = fillWaitTime / 1000;
						tx = await client.placeOrder(
							subaccount,
							market,
							OrderType.LIMIT,
							side,
							price,
							remainingOrderSize,
							clientId,
							OrderTimeInForce.GTT,
							fillSecond,
							OrderExecution.DEFAULT,
							true,
							false,
						  );
					}
					console.log('**Limit Order Placed**','Waiting for order to be filled...',fillWaitTime,'OpenBlock: ',openBlock,'GoodUntilBlock: ',goodUntilBlock);
				} catch (error) {
					console.log(error.message);
				}
			
				await _sleep(fillWaitTime);
				const status : OrderFilledInfo = await OrderFilledInfo(market, openBlock, String(clientId));
				txOrders.push(status); 
				totalFilled += Number(status.totalFilled);
				console.log('Total AmountFilled: ', totalFilled, 'of: ', remainingOrderSize);
				remainingOrderSize -= Number(status.totalFilled);
				if (count === maxAttempts && status.isFilled) {
					// adjust size on first run to account for rounding errors
					remainingOrderSize = 0;
				}			
				if (totalFilled >= size || remainingOrderSize <= 0) {
					console.log('Order Fully Filled. Returning order object...');
					return {
						orderType,
						totalFilled,
						remainingOrderSize,
						txOrders
					};
				};
				console.log('Order is not Fully FILLED yet.');
				if (!status.isFilled){
					try {
						console.log('Attempting to cancel the order...');
						// cancel the short or long term order
						if (isShortTerm) {
							await client.cancelOrder(
								subaccount,
								clientId,
								OrderFlags.SHORT_TERM,
								market,
								goodUntilBlock + (fillWaitTime / 1000),
								0,
							);	
						} else {
							await client.cancelOrder(
								subaccount,
								clientId,
								OrderFlags.LONG_TERM,
								market,
								0,
								120,
							  );
						}
	
						console.log('Order canceled successfully.');
						
					} catch (cancelError) {
						console.error('Failed to cancel the order:', cancelError.message);
					} 
				}
				// wait for placeOrder & cancelOrder to complete
				count--;
				if (count > 0) {
					console.log('Attempting to place new Limit order...');
				} else {
					if (orderParams.trdmAlert === "LIMIT THEN MARKET") {
						console.log('Failed to fill full Limit order size after', maxAttempts, 'attempts. switching to market order instead.');
					}
					console.log('Failed to fill full Limit order size after', maxAttempts, 'attempts.');
					return {
						orderType,
						totalFilled,
						remainingOrderSize,
						txOrders
					}
				}
				
			} else {
				console.log('Order Fully Filled.');
				return {
					orderType,
					totalFilled,
					remainingOrderSize,
					txOrders
				};
			};
		}
		console.warn('Failed to place or fill Limit order after', maxAttempts, 'attempts.');
		return {
			orderType,
			totalFilled : 0,
			remainingOrderSize : remainingOrderSize,
			txOrders : []
		};
	}
	

	const doMarketOrder = async (
		amountFilled: number,
		remaining: number,
		reduceOnly = false
	) =>{
		console.log('Attempting to place Market order:');
		const orderType = "MARKET ORDER"
		const maxAttempts = marketOrderMaxRetries;
		const fillWaitTime = marketOrderTimeout;
		const slippagePercentage = 0.05;
		let count = 2;
		let totalFilled = amountFilled;
		let remainingOrderSize = remaining;
		console.log("Attempting to place Market order. Remaining Order Size: ", remainingOrderSize);
		while (count > 0) {
			console.log('Place order attempt:', maxAttempts - count + 1, 'of', maxAttempts);
			const book = await clientIndexer.markets.getPerpetualMarketOrderbook(market);
			const price = side === OrderSide.BUY ? Number(book.asks[1].price) * (1 + slippagePercentage) : Number(book.bids[1].price) * (1 - slippagePercentage);		
			const clientId = generateRandomInt32();
			const txOrders = [];
			console.log('Client ID: ', clientId);
			const block = await clientIndexer.utility.getHeight();	
			console.log('Block Height: ', block.height);		
			const nextValidBlockHeight = Number(block.height) + 1;
			const goodUntilBlock = nextValidBlockHeight + (fillWaitTime / 1000);
			const openBlock = Number(block.height);
			let tx;	
			if (totalFilled <= size) {
				// place a market order		
				try {
					console.log('--- NEW MARKET ORDER: ---', side+' Market Price: ', price, 'Order Size: ', remainingOrderSize, 'Reduce Only: ',reduceOnly);
					// place a short term order
					tx = await client.placeShortTermOrder(
						subaccount,
						market,
						side,
						price,
						remainingOrderSize,
						clientId,
						goodUntilBlock,
						OrderTimeInForce.GTT,
						reduceOnly,
					);
					console.log('**Market Order Placed**','Waiting for order to be filled...',fillWaitTime,'OpenBlock: ',openBlock,'GoodUntilBlock: ',goodUntilBlock);
				} catch (error) {
					console.log(error.message);
				}
			
				await _sleep(fillWaitTime);
				const status : OrderFilledInfo = await OrderFilledInfo(market, openBlock, String(clientId));
				txOrders.push(status); 
				totalFilled += Number(status.totalFilled);
				console.log('Total AmountFilled: ', totalFilled, 'of: ', remainingOrderSize);
				remainingOrderSize -= Number(status.totalFilled);
				if (count === maxAttempts && status.isFilled) {
					// adjust size on first run to account for rounding errors
					remainingOrderSize = 0;
				}			
				if (totalFilled >= size || remainingOrderSize <= 0) {
					console.log('Order Fully Filled. Returning order object...');
					return {
						orderType,
						totalFilled,
						remainingOrderSize,
						txOrders
					};
				};
				console.log('Order is not Fully FILLED yet.');
				if (!status.isFilled){
					try {
						console.log('Attempting to cancel the order...');
						// cancel the short term order
						await client.cancelOrder(
							subaccount,
							clientId,
							OrderFlags.SHORT_TERM,
							market,
							goodUntilBlock + (fillWaitTime / 1000),
							0,
						);	
						console.log('Order canceled successfully.');
						
					} catch (cancelError) {
						console.error('Failed to cancel the order:', cancelError.message);
					} 
				}
				// wait for placeOrder & cancelOrder to complete
				count--;
				if (count > 0) {
					console.log('Attempting to place new Market order...');
				} else {
					if (orderParams.trdmAlert === "LIMIT THEN MARKET") {
						console.log('Failed to fill full Market order size after', maxAttempts, 'attempts. No More Attempts Will Be Made.');
					}
					console.log('Failed to fill full Market order size after', maxAttempts, 'attempts.');
					return {
						orderType,
						totalFilled,
						remainingOrderSize,
						txOrders
					}
				}
				
			} else {
				console.log('Order Fully Filled.');
				return {
					orderType,
					totalFilled,
					remainingOrderSize,
					txOrders
				};
			};
		}
		console.warn('Failed to place or fill Market order after', maxAttempts, 'attempts.');
		return {
			orderType,
			totalFilled : 0,
			remainingOrderSize : remainingOrderSize,
			txOrders : []
		};
	}

	//------------------- DO ACTIONS -------------------//
	// First attempt to fill limit order
	const res = [];
	let amountFilled = 0;
	let remaining = size;

	// LIMIT ORDER FILLS
	if (orderParams.limitOrderAttempts && orderParams.limitOrderSeconds) {
		const limitSeconds = orderParams.limitOrderSeconds * 1000;

		if (orderParams.trdmAlert === "LIMIT THEN MARKET") {
			console.log('LIMIT THEN MARKET Order received.')	
			const attemptLimitOrder = await doLimitOrder(amountFilled,remaining,limitSeconds,orderParams.limitOrderAttempts);
			res.push(attemptLimitOrder);
			amountFilled += Number(attemptLimitOrder.totalFilled);
			remaining = Number(attemptLimitOrder.remainingOrderSize);
			console.log('Total AmountFilled: ', amountFilled, 'of: ', remaining <= 0 ? amountFilled : size);		
			if (remaining > 0) {
				// attempt to fill remaining size with market order
				const attemptMarketOrder = await doMarketOrder(amountFilled,remaining);
				res.push(attemptMarketOrder);
			}
		
		}
		else if (orderParams.trdmAlert === "LIMIT ONLY") {
			console.log('LIMIT ONLY Order received.')
			const attemptLimitOrder = await doLimitOrder(amountFilled,remaining,limitSeconds,orderParams.limitOrderAttempts);
			res.push(attemptLimitOrder);
			amountFilled += Number(attemptLimitOrder.totalFilled);
			console.log('Total AmountFilled: ', amountFilled, 'of: ', size);
		} else {
			console.error('Invalid TRDM_Alert: ', orderParams.trdmAlert, 'Must be LIMIT THEN MARKET or LIMIT ONLY if limitOrderAttempts and limitOrderSeconds are provided.');
		}
	}

	// MARKET ORDER FILLS
	if (orderParams.trdmAlert === "MARKET ONLY" || orderParams.trdmAlert === "MARKET REDUCE") {
		
		if (orderParams.trdmAlert === "MARKET REDUCE") {
			console.log('MARKET REDUCE Order received.')
		} else {
			console.log('MARKET ONLY Order received.')
		}
		const isReduce = orderParams.trdmAlert === "MARKET REDUCE";
		const attemptMarketOrder = await doMarketOrder(amountFilled,remaining, isReduce);
		res.push(attemptMarketOrder);
	}

	if (orderParams.trdmAlert === "MARKET CLOSE") {
		console.log('MARKET CLOSE Order received.')
		const attemptMarketOrder = await doMarketOrder(amountFilled,remaining, true);
		res.push(attemptMarketOrder);
	}

	if (res.length === 0) {
		console.error('Failed to place or fill order with alert provided',orderParams);
	}
	console.log('Final Result: ', res);
	return res;		
};

function generateRandomInt32(): number {
	const maxInt32 = 2147483647;
	return Math.floor(Math.random() * (maxInt32 + 1));
}

// export const getDyDxV4Orders = async (market: string) => {
// 	const client = dydxV4IndexerClient();
// 	const localWallet = await generateLocalWallet();
// 	if (!localWallet) return;

// 	const tickerOrders = await client.account.getSubaccountOrders(localWallet.address, 0, market);
// 	console.log(market+' Orders: ', tickerOrders);
// 	return tickerOrders;
// };


interface OrderFilledInfo {
    isFilled: boolean;
    positionSize: number;
	totalFilled: number;

}

/**
 * Determines whether a dYdX V4 order associated with the provided clientId has been filled.
 * @param market The market of the order.
 * @param openBlock The block height at which the order was opened.	
 * @param clientId The unique identifier of the order.
 * @returns An object containing information about the order's fill status and total filled amount.
 */
export const OrderFilledInfo = async (
    market: string,
	openBlock: number,
	clientId: string
): Promise<OrderFilledInfo> => {
    try {
        const client = dydxV4IndexerClient();
        const localWallet = await generateLocalWallet();
        if (!localWallet) return;   
        const response = await client.account.getSubaccountFills(localWallet.address, 0);
        const subaccountFills = response.fills;
        
        if (subaccountFills.length > 0) {
            const filteredFills = subaccountFills.filter((fill: any) => {
                const createdAtHeight = fill.createdAtHeight;
                return fill.market === market && Number(createdAtHeight) > Number(openBlock);
            });

            if (filteredFills.length > 0) {
                //console.log(`${market} Filtered Fills: `, filteredFills);
                for (const fill of filteredFills) {
                    const orderId = fill.orderId;
                    const order = await client.account.getOrder(orderId);
                    if (order.clientId == clientId) {
                        return {
                            isFilled: order.status === 'FILLED',
							positionSize: Number(order.size),
							totalFilled: Number(order.totalFilled),
                        };
                    }
                }              
            } else {
                console.log('No fills found for market: ', market);
                return {
                    isFilled: false,
                    positionSize: Number(0),
					totalFilled: Number(0),
                }
            }
        }

        console.log('openBlock: ', openBlock);
        return {
            isFilled: false,
            positionSize: Number(0),
			totalFilled: Number(0),
        };
    } catch (error) {
        console.error('Error retrieving order information:', error.message);
        // Handle the error gracefully, e.g., by returning a default value or rethrowing the error.
        throw error;
    }
};
