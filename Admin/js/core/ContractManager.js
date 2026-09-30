// js/core/ContractManager.js
import { FACTORY_ABI, TRON_FACTORY_ABI } from '../config/networks.js';

export class ContractManager {
  constructor(networkManager) {
    this.networkManager = networkManager;
    this.factoryContract = null;
  }

  async initFactory() {
    const connection = this.networkManager.getConnection();
    const network = connection.network;

    if (!network.factoryAddress) {
      throw new Error(`آدرس Factory برای شبکه ${network.name || 'نامشخص'} تنظیم نشده است`);
    }

    if (this.networkManager.isEVM()) {
      this.factoryContract = new connection.web3.eth.Contract(
        FACTORY_ABI,
        network.factoryAddress
      );
    } else if (this.networkManager.isTVM()) {
      this.factoryContract = await connection.tronWeb.contract(
        TRON_FACTORY_ABI,
        network.factoryAddress
      );
    }

    return this.factoryContract;
  }

  async createSingleOwnerFund(projectId, ownerAddress) {
    await this._ensureContract();

    if (this.networkManager.isEVM()) {
      const connection = this.networkManager.getConnection();
      return await this.factoryContract.methods
        .createSingleOwnerFund(projectId, ownerAddress)
        .send({
          from: connection.account,
          gas: 5000000
        });
    }

    if (this.networkManager.isTVM()) {
      const connection = this.networkManager.getConnection();
      return await this.factoryContract
        .createSingleOwnerFund(projectId, ownerAddress)
        .send({
          from: connection.account,
          feeLimit: 1500000000
        });
    }
  }

  async createMultisigFund(projectId, owners, requiredSigs) {
    await this._ensureContract();

    if (this.networkManager.isEVM()) {
      const connection = this.networkManager.getConnection();
      return await this.factoryContract.methods
        .createMultisigFund(projectId, owners, requiredSigs)
        .send({
          from: connection.account,
          gas: 5000000
        });
    }

    if (this.networkManager.isTVM()) {
      const connection = this.networkManager.getConnection();
      return await this.factoryContract
        .createMultisigFund(projectId, owners, requiredSigs)
        .send({
          from: connection.account,
          feeLimit: 1500000000
        });
    }
  }

  // Block containing the confirmed treasury-creation transaction.
  // This is the canonical starting point for indexer scanning.
  async getTransactionBlock(tx) {
    if (tx == null) {
      throw new Error('اطلاعات تراکنش ساخت خزانه دریافت نشد');
    }

    if (this.networkManager.isEVM()) {
      const connection = this.networkManager.getConnection();
      const receipt = tx.receipt || tx;

      if (receipt?.blockNumber != null) {
        return Number(receipt.blockNumber);
      }

      const transactionHash =
        tx.transactionHash || tx.tx || tx.hash || receipt?.transactionHash;

      if (!transactionHash) {
        throw new Error('هش تراکنش برای دریافت blockNumber یافت نشد');
      }

      const fetchedReceipt = await connection.web3.eth.getTransactionReceipt(transactionHash);
      if (fetchedReceipt?.blockNumber == null) {
        throw new Error('receipt تراکنش هنوز blockNumber ندارد');
      }

      return Number(fetchedReceipt.blockNumber);
    }

    if (this.networkManager.isTVM()) {
      const connection = this.networkManager.getConnection();
      const transactionId =
        typeof tx === 'string'
          ? tx
          : tx.txid ||
            tx.transactionId ||
            tx.txID ||
            tx.id ||
            tx.transactionHash ||
            tx.hash;

      if (!transactionId) {
        throw new Error('شناسه تراکنش برای دریافت blockNumber یافت نشد');
      }

      const info = await connection.tronWeb.trx.getTransactionInfo(transactionId);
      const blockNumber = Number(info?.blockNumber);

      if (!Number.isInteger(blockNumber) || blockNumber < 0) {
        throw new Error('blockNumber تراکنش Tron دریافت نشد');
      }

      return blockNumber;
    }

    throw new Error(`دریافت block تراکنش برای شبکه ${this.networkManager.getCurrentNetwork()?.name || 'نامشخص'} پشتیبانی نمی‌شود`);
  }

  async getFundAddress(projectId) {
    await this._ensureContract();

    if (this.networkManager.isEVM()) {
      return await this.factoryContract.methods
        .getFundAddress(projectId)
        .call();
    }

    if (this.networkManager.isTVM()) {
      return await this.factoryContract
        .getFundAddress(projectId)
        .call();
    }
  }

  async _ensureContract() {
    if (!this.factoryContract) {
      await this.initFactory();
    }
    if (!this.factoryContract) {
      throw new Error('قرارداد Factory مقداردهی نشد');
    }
  }
}
