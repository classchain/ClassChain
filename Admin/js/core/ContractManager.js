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
