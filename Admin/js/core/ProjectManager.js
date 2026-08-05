// js/core/ProjectManager.js
// Phase 2: مدل اصلی = funds[networkId]
// فیلدهای Legacy فقط برای خواندن داده‌های قدیمی و سازگاری موقت با frontend

export class ProjectManager {
  constructor() {
    this.projects = null;
    this.jsonPath = '/ClassChain/frontend/data/Projects.json';
    this.basePath = '/ClassChain/frontend/data/';

    /**
     * نگاشت موقتی شبکه → فیلد قدیمی در attributes
     * فقط برای:
     *  - خواندن پروژه‌هایی که هنوز funds ندارند
     *  - نوشتن موازی تا frontend (donate/dashboard) نشکند
     * در فاز بعدی می‌توان این را کامل حذف کرد.
     */
    this.networkFieldMapping = {
      polygon_amoy: 'contractAddress',
      polygon_mainnet: 'contractAddressMainnet',
      tron_nile: 'contractAddressTron',
      tron_mainnet: 'contractAddressTronMainnet',
      ethereum_mainnet: 'contractAddressEthereum',
      ethereum_sepolia: 'contractAddressSepolia',
      bsc_mainnet: 'contractAddressBSC',
      bsc_testnet: 'contractAddressBSCTestnet',
      arbitrum_mainnet: 'contractAddressArbitrum',
      optimism_mainnet: 'contractAddressOptimism',
      base_mainnet: 'contractAddressBase',
      avalanche_mainnet: 'contractAddressAvalanche'
      // CLC حذف شد
    };

    // فیلد سراسری قدیمی multisig (legacy) — ترجیحاً از funds[network].multisigAddress استفاده شود
    this.multisigField = 'multisigAddress';
  }

  // ============================================
  // بارگذاری پروژه‌ها
  // ============================================
  async loadProjects() {
    try {
      console.log(`🔄 در حال بارگذاری پروژه‌ها از: ${this.jsonPath}`);

      const response = await fetch(this.jsonPath, {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`فایل Projects.json در مسیر ${this.jsonPath} یافت نشد`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.projects = await response.json();
      console.log(`✅ ${this.projects.features?.length || 0} پروژه بارگذاری شد`);

      this._logFundStatistics();
      return this.projects;
    } catch (error) {
      console.error('❌ خطا در بارگذاری پروژه‌ها:', error);
      throw new Error('امکان بارگذاری پروژه‌ها وجود ندارد. لطفاً مسیر فایل را بررسی کنید.');
    }
  }

  // ============================================
  // آمار خزانه‌ها
  // ============================================
  _logFundStatistics() {
    if (!this.projects) return;

    let totalFunds = 0;
    const networkStats = {};

    this.projects.features.forEach(f => {
      const all = this.getAllFunds(f);
      Object.keys(all).forEach(networkId => {
        totalFunds++;
        networkStats[networkId] = (networkStats[networkId] || 0) + 1;
      });
    });

    console.log(`📊 آمار خزانه‌ها: ${totalFunds} خزانه در مجموع`);
    Object.keys(networkStats).forEach(networkId => {
      console.log(`   - ${networkId}: ${networkStats[networkId]} خزانه`);
    });
  }

  // ============================================
  // دریافت پروژه
  // ============================================
  async getProjectById(projectId) {
    if (!this.projects) {
      await this.loadProjects();
    }

    if (!this.projects) {
      throw new Error('داده‌های پروژه‌ها بارگذاری نشده است');
    }

    const project = this.projects.features?.find(
      f => f.attributes?.ProjectID === projectId
    );

    if (!project) {
      console.warn(`⚠️ پروژه ${projectId} یافت نشد`);
      const ids = this.projects.features?.slice(0, 5).map(f => f.attributes?.ProjectID) || [];
      console.log('📋 ProjectIDهای موجود:', ids);
    }

    return project || null;
  }

  // ============================================
  // آدرس خزانه در یک شبکه
  // اولویت: funds[networkId] → فیلد Legacy
  // ============================================
  getFundAddress(project, networkId) {
    if (!project) return null;

    const attr = project.attributes || {};

    // 1) ساختار جدید
    const funds = attr.funds || {};
    const fund = funds[networkId];
    if (fund?.address && fund.address !== 'null' && fund.address !== '') {
      return fund.address;
    }

    // 2) Legacy
    const field = this.networkFieldMapping[networkId];
    if (field) {
      const address = attr[field];
      if (address && address !== 'null' && address !== '') {
        return address;
      }
    }

    return null;
  }

  // ============================================
  // آدرس Multisig برای یک شبکه (ترجیحی) یا هر شبکه
  // ============================================
  getMultisigAddress(project, networkId = null) {
    if (!project) return null;
    const attr = project.attributes || {};
    const funds = attr.funds || {};

    if (networkId) {
      const fund = funds[networkId];
      if (fund?.multisigAddress && fund.multisigAddress !== 'null' && fund.multisigAddress !== '') {
        return fund.multisigAddress;
      }
    } else {
      for (const id in funds) {
        const fund = funds[id];
        if (fund?.multisigAddress && fund.multisigAddress !== 'null' && fund.multisigAddress !== '') {
          return fund.multisigAddress;
        }
      }
    }

    // Legacy سراسری
    const address = attr[this.multisigField];
    if (address && address !== 'null' && address !== '') {
      return address;
    }

    return null;
  }

  hasFund(project, networkId) {
    return !!this.getFundAddress(project, networkId);
  }

  // ============================================
  // همه خزانه‌های یک پروژه
  // اولویت با funds؛ Legacy فقط اگر در funds نبود
  // ============================================
  getAllFunds(project) {
    if (!project) return {};

    const allFunds = {};
    const attr = project.attributes || {};

    // 1) ساختار جدید
    const funds = attr.funds || {};
    Object.keys(funds).forEach(networkId => {
      const fund = funds[networkId];
      if (fund?.address && fund.address !== 'null' && fund.address !== '') {
        allFunds[networkId] = {
          ...fund,
          networkId,
          source: 'funds'
        };
      }
    });

    // 2) Legacy — فقط شبکه‌هایی که هنوز در funds نیستند
    Object.keys(this.networkFieldMapping).forEach(networkId => {
      if (allFunds[networkId]) return;

      const field = this.networkFieldMapping[networkId];
      const address = attr[field];
      if (address && address !== 'null' && address !== '') {
        allFunds[networkId] = {
          address,
          networkId,
          field,
          source: 'legacy',
          multisigAddress: null,
          owners: [],
          requiredSignatures: 1,
          isMultisig: false
        };
      }
    });

    return allFunds;
  }

  // ============================================
  // به‌روزرسانی خزانه
  // اصلی: funds[networkId]
  // موازی: فیلد Legacy (برای سازگاری موقت frontend)
  // ============================================
  async updateProjectFunds(projectId, networkId, fundData) {
    if (!this.projects) {
      await this.loadProjects();
    }

    const project = await this.getProjectById(projectId);
    if (!project) {
      throw new Error(`پروژه ${projectId} یافت نشد`);
    }

    const attr = project.attributes;

    // --- ساختار اصلی ---
    if (!attr.funds) {
      attr.funds = {};
    }

    attr.funds[networkId] = {
      address: fundData.address,
      multisigAddress: fundData.multisigAddress || null,
      owners: fundData.owners || [],
      requiredSignatures: fundData.requiredSignatures || 1,
      createdAt: fundData.createdAt || new Date().toISOString(),
      network: networkId,
      isMultisig: !!(fundData.multisigAddress || (fundData.owners && fundData.owners.length > 1))
    };

    // --- سازگاری موقت با frontend ---
    const field = this.networkFieldMapping[networkId];
    if (field) {
      attr[field] = fundData.address;
    }

    if (fundData.multisigAddress) {
      attr[this.multisigField] = fundData.multisigAddress;
    }

    console.log(`✅ خزانه پروژه ${projectId} در شبکه ${networkId} به‌روز شد`);
    console.log(`   funds[${networkId}].address = ${fundData.address}`);
    if (field) {
      console.log(`   legacy ${field} = ${fundData.address}`);
    }
    if (fundData.multisigAddress) {
      console.log(`   multisig = ${fundData.multisigAddress}`);
    }

    return this.projects;
  }

  // ============================================
  // ذخیره JSON (رشته)
  // ============================================
  async saveProjects() {
    if (!this.projects) {
      throw new Error('داده‌های پروژه‌ها بارگذاری نشده است');
    }
    return JSON.stringify(this.projects, null, 2);
  }

  // ============================================
  // GitHub API (از طریق Worker)
  // ============================================
  async pushToGitHub(jsonContent, message = 'به‌روزرسانی پروژه‌ها') {
    const WORKER_URL = 'https://classchain-github-proxy.classchain.workers.dev';
    const ADMIN_KEY = sessionStorage.getItem('classchain_admin_key');

    if (!ADMIN_KEY) {
      throw new Error('رمز ادمین تنظیم نشده است. لطفاً وارد شوید.');
    }

    const PATH = 'frontend/data/Projects.json';

    try {
      const sha = await this._getFileSha(WORKER_URL, ADMIN_KEY, PATH);

      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'X-Admin-Key': ADMIN_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: PATH,
          message,
          content: btoa(unescape(encodeURIComponent(jsonContent))),
          sha
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'خطا در آپلود به GitHub');
      }

      return await response.json();
    } catch (error) {
      console.error('❌ GitHub upload error:', error);
      throw error;
    }
  }

  async _getFileSha(workerUrl, adminKey, path) {
    try {
      const response = await fetch(`${workerUrl}?path=${encodeURIComponent(path)}`, {
        method: 'GET',
        headers: { 'X-Admin-Key': adminKey }
      });

      if (response.ok) {
        const data = await response.json();
        return data.sha;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  getProjectsByNetwork(networkId) {
    if (!this.projects) return [];

    return (
      this.projects.features?.filter(f => {
        return this.hasFund(f, networkId);
      }) || []
    );
  }

  getProjectStatus(projectId, networkId) {
    const project = this.projects?.features?.find(
      f => f.attributes?.ProjectID === projectId
    );

    if (!project) return 'not_found';

    const address = this.getFundAddress(project, networkId);
    if (address) return 'active';

    const funds = project.attributes?.funds || {};
    if (funds[networkId] && funds[networkId].address === null) return 'pending';

    return 'not_created';
  }

  async loadJSONFile(filename) {
    try {
      const response = await fetch(`${this.basePath}${filename}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`❌ خطا در بارگذاری ${filename}:`, error);
      return null;
    }
  }
}
