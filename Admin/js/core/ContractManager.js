// js/core/ContractManager.js
import { FACTORY_ABI, TRON_FACTORY_ABI } from '../config/networks.js';

const EVM_ZERO = '0x0000000000000000000000000000000000000000';
const TRON_ZERO_HEX = '410000000000000000000000000000000000000000';
const TRON_ZERO_BASE58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

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

  /** True if address is the zero address on the current network (EVM or TVM). */
  isZeroAddress(address) {
    if (address == null || address === '') return true;
    const a = String(address).trim().toLowerCase();
    if (!a) return true;
    if (a === EVM_ZERO.toLowerCase()) return true;
    if (a === TRON_ZERO_HEX.toLowerCase()) return true;
    if (a === TRON_ZERO_BASE58.toLowerCase()) return true;
    // bare 40-hex zero without 0x / 41 prefix
    if (/^0{40}$/.test(a)) return true;
    if (/^41?0{40}$/.test(a)) return true;
    return false;
  }

  _extractTxId(tx) {
    if (tx == null) return null;
    if (typeof tx === 'string') return tx;
    return (
      tx.txid ||
      tx.transactionId ||
      tx.txID ||
      tx.id ||
      tx.transactionHash ||
      tx.hash ||
      tx.transaction?.txID ||
      tx.transaction?.txid ||
      tx.transaction?.transactionId ||
      null
    );
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
      const transactionId = this._extractTxId(tx);

      if (!transactionId) {
        throw new Error('شناسه تراکنش برای دریافت blockNumber یافت نشد');
      }

      // TronWeb may return the txid before the transaction is included in a
      // solidified block. getTransactionInfo() returns {} until then.
      // Poll instead of failing immediately so scanFromBlock is canonical.
      const timeoutMs = 120000;
      const pollIntervalMs = 3000;
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        try {
          const info = await connection.tronWeb.trx.getTransactionInfo(transactionId);

          if (info && Object.keys(info).length > 0) {
            const blockNumber = Number(info.blockNumber);

            if (Number.isInteger(blockNumber) && blockNumber >= 0) {
              if (info.receipt?.result && info.receipt.result !== 'SUCCESS') {
                throw new Error(
                  `تراکنش ساخت خزانه در Tron با وضعیت ${info.receipt.result} نهایی شد`
                );
              }

              return blockNumber;
            }
          }
        } catch (error) {
          if (error?.message?.includes('با وضعیت')) {
            throw error;
          }
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }

      throw new Error(
        `تراکنش Tron هنوز در یک بلاک تأییدشده قرار نگرفته است. شناسه تراکنش: ${transactionId}`
      );
    }

    throw new Error(`دریافت block تراکنش برای شبکه ${this.networkManager.getCurrentNetwork()?.name || 'نامشخص'} پشتیبانی نمی‌شود`);
  }

  /**
   * Resolve the newly created fund address after the create tx is confirmed.
   * Handles: web3 events/receipt, TronWeb txid-only responses, and factory mapping.
   * Returns { fundAddress, ownerOrMultisig, isMultisig } (addresses may be hex on TVM).
   */
  async resolveFundAddressAfterCreate(projectId, tx) {
    let fundAddress = null;
    let ownerOrMultisig = null;
    let isMultisig = false;

    // 1) EVM-style events / receipt (web3 send result)
    if (tx && typeof tx === 'object') {
      if (tx.events) {
        const fundCreated = tx.events.FundCreated;
        if (fundCreated) {
          const rv = fundCreated.returnValues || fundCreated.args || {};
          fundAddress = rv.fundAddress || rv[1] || null;
          ownerOrMultisig = rv.ownerOrMultisig || rv[2] || null;
          isMultisig = Boolean(rv.isMultisig);
        }
        if (!fundAddress) {
          for (const eventName of Object.keys(tx.events)) {
            const event = tx.events[eventName];
            const args = event?.returnValues || event?.args || {};
            if (args.fundAddress || args.fund) {
              fundAddress = args.fundAddress || args.fund;
              ownerOrMultisig = args.ownerOrMultisig || args.owner || args[1] || ownerOrMultisig;
              isMultisig = Boolean(args.isMultisig);
              break;
            }
          }
        }
      }

      if (!fundAddress && tx.receipt?.contractAddress) {
        fundAddress = tx.receipt.contractAddress;
      }

      if (!fundAddress && Array.isArray(tx.result) && tx.result.length > 0) {
        fundAddress = tx.result[0];
      }
    }

    // 2) Tron: parse getTransactionInfo log / contract_result when tx is only a txid
    if (!fundAddress && this.networkManager.isTVM()) {
      try {
        const connection = this.networkManager.getConnection();
        const transactionId = this._extractTxId(tx);
        if (transactionId) {
          const info = await connection.tronWeb.trx.getTransactionInfo(transactionId);
          // contract_address is set for CREATE; for factory calls use log topics
          if (info?.contract_address && !this.isZeroAddress(info.contract_address)) {
            // factory call — not the fund itself; ignore unless no better source
          }
          // Log topics: FundCreated has indexed fundAddress as topic[2] (topic[0]=sig, topic[1]=projectId hash)
          const logs = info?.log || info?.logs || [];
          for (const log of logs) {
            const topics = log.topics || log.topic || [];
            // topics often hex without 0x; address is last 40 hex chars of an indexed address topic
            if (topics.length >= 3) {
              const candidate = topics[2];
              if (typeof candidate === 'string') {
                let hex = candidate.replace(/^0x/i, '');
                if (hex.length >= 40) {
                  hex = hex.slice(-40);
                  const with41 = '41' + hex;
                  if (!this.isZeroAddress(with41) && !this.isZeroAddress('0x' + hex)) {
                    fundAddress = with41;
                    if (topics.length >= 4) {
                      let ownerHex = String(topics[3]).replace(/^0x/i, '').slice(-40);
                      ownerOrMultisig = '41' + ownerHex;
                    }
                    // data may contain isMultisig as bool
                    if (log.data) {
                      const data = String(log.data).replace(/^0x/i, '');
                      if (data.length >= 64) {
                        isMultisig = parseInt(data.slice(0, 64), 16) !== 0;
                      }
                    }
                    console.log('✅ آدرس خزانه از Tron log topics:', fundAddress);
                    break;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('خطا در parse تراکنش Tron برای آدرس خزانه:', e);
      }
    }

    // 3) Factory mapping — most reliable after confirmation (poll briefly)
    if (!fundAddress || this.isZeroAddress(fundAddress)) {
      const timeoutMs = 45000;
      const pollIntervalMs = 2000;
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        try {
          const mapped = await this.getFundAddress(projectId);
          if (mapped && !this.isZeroAddress(mapped)) {
            fundAddress = mapped;
            console.log('✅ آدرس خزانه از getFundAddress:', fundAddress);
            break;
          }
        } catch (e) {
          console.warn('getFundAddress هنوز آماده نیست:', e?.message || e);
        }
        await new Promise(r => setTimeout(r, pollIntervalMs));
      }
    }

    if (!fundAddress || this.isZeroAddress(fundAddress)) {
      return { fundAddress: null, ownerOrMultisig: null, isMultisig: false };
    }

    return { fundAddress, ownerOrMultisig, isMultisig };
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

  async getFundOwner(fundAddress) {
    await this._ensureContract();
    const connection = this.networkManager.getConnection();

    // ABI ساده برای owner()
    const ownerAbi = [{
      "inputs": [],
      "name": "owner",
      "outputs": [{"internalType": "address", "name": "", "type": "address"}],
      "stateMutability": "view",
      "type": "function"
    }];

    if (this.networkManager.isEVM()) {
      const fund = new connection.web3.eth.Contract(ownerAbi, fundAddress);
      return await fund.methods.owner().call();
    }

    if (this.networkManager.isTVM()) {
      const fund = await connection.tronWeb.contract(ownerAbi, fundAddress);
      return await fund.owner().call();
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
