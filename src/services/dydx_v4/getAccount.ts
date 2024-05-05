import "dotenv/config";
import { dydxV4IndexerClient, generateLocalWallet } from "./client";

export const dydxV4GetAccount = async () => {
  try {
    const client = dydxV4IndexerClient();
    const localWallet = await generateLocalWallet();
    if (!localWallet) return;
    const response = await client.account.getSubaccount(localWallet.address, 0);
    let assetPositions;
    let perpPositions;
    // Get asset positions
    try {
      const response = await client.account.getSubaccountAssetPositions(
        localWallet.address,
        0
      );
      //console.log(response);
      assetPositions = response.positions;
      // console.log(positions);
      // if (positions.length > 0) {
      //   const positions0 = positions[0];
      //   console.log(positions0);
      // }
    } catch (error) {
      console.log(error.message);
    }

    // Get perp positions
    try {
      const response = await client.account.getSubaccountPerpetualPositions(
        localWallet.address,
        0
      );
      //console.log(response);
      perpPositions = response.positions;
      //console.log(positions);
      // if (positions.length > 0) {
      //   const positions0 = positions[0];
      //   console.log(positions0);
      // }
    } catch (error) {
      console.log(error.message);
    }
    console.log(
      "connected to dydx v4 account: " +
        JSON.stringify(response.subaccount, null, 2)    
    );
    if (Number(response.subaccount.freeCollateral) > 0) {
      return { isReady: true, account: response.subaccount, perpPositions: perpPositions, assetPositions: assetPositions };
    } else {
      return { isReady: false, account: null };
    }
  } catch (error) {
    console.log(error);
  }
};
