import { OrderSide } from '@dydxprotocol/v4-client-js';

type TRDM_Alert = "LIMIT ONLY" | "MARKET ONLY" | "LIMIT THEN MARKET" | "MARKET CLOSE" | "MARKET REDUCE"
export type AlertObject = {
	exchange: string;
	strategy: string;
	market: string;
	size?: number;
	sizeUsd?: number;
	sizeByLeverage?: number;
	order: string;
	price: number;
	position: string;
	reverse: boolean;
	passphrase?: string;
	collateral?: string;
	trdmAlert: TRDM_Alert;
	limitOrderSeconds?: number;
	limitOrderAttempts?: number;	
};

export type dydxV4OrderParams = {
	market: string;
	side: OrderSide;
	size: number;
	price: number;
	trdmAlert: TRDM_Alert;
	limitOrderSeconds?: number;
	limitOrderAttempts?: number;
};
