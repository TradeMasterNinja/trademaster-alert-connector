import "dotenv/config";
import { dydxV4IndexerClient, generateLocalWallet } from "./client";

export const dydxV4GetAccount = async () => {
  try {
    const client = dydxV4IndexerClient();
    const localWallet = await generateLocalWallet();
    if (!localWallet) return;
    const response = await client.account.getSubaccount(localWallet.address, 0);
    const openPositions = response.subaccount.openPerpetualPositions;
    console.log(
      "connected to dydx v4 account: " +
        JSON.stringify(openPositions, null, 2)    
    );
    if (Number(response.subaccount.freeCollateral) > 0) {
      return { isReady: true, account: response.subaccount, openPositions: openPositions};
    } else {
      return { isReady: false, account: null, openPositions: null };
    }
  } catch (error) {
    console.log(error);
  }
};
