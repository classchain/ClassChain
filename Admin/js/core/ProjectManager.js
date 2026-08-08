// js/core/ProjectManager.js
// Phase 3: Canonical model = attributes.funds[networkId]
// Legacy network-specific contract fields are no longer supported.

export class ProjectManager {
  constructor() {
    this.projects = null;
    this.jsonPath = '/ClassChain/frontend/data/Projects.json';
    this.basePath = '/ClassChain/frontend/data/';
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
      console.log(`   - ${networkId}: ${networkStats[networkId]}`);
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
      const ids =
        this.projects.features?.slice(0, 5).map(f => f.attributes?.ProjectID) || [];
      console.log('📋 ProjectIDهای موجود:', ids);
    }

    return project || null;
  }

  // ============================================
  // آدرس خزانه در یک شبکه
  // Canonical source: attributes.funds[networkId].address
  // ============================================
  getFundAddress(project, networkId) {
    if (!project || !networkId) return null;

    const fund = project.attributes?.funds?.[networkId];

    if (fund?.address && fund.address !== 'null' && fund.address !== '') {
      return fund.address;
    }

    return null;
  }

  // ============================================
  // آدرس Multisig برای یک شبکه
  // Canonical source: attributes.funds[networkId].multisigAddress
  // ============================================
  getMultisigAddress(project, networkId = null) {
    if (!project) return null;

    const funds = project.attributes?.funds || {};

    if (networkId) {
      const address = funds[networkId]?.multisigAddress;
      return address && address !== 'null' && address !== '' ? address : null;
    }

    // اگر networkId مشخص نشده، اولین multisig معتبر را برگردان.
    for (const id of Object.keys(funds)) {
      const address = funds[id]?.multisigAddress;
      if (address && address !== 'null' && address !== '') {
        return address;
      }
    }

    return null;
  }

  hasFund(project, networkId) {
    return !!this.getFundAddress(project, networkId);
  }

  // ============================================
  // همه خزانه‌های یک پروژه
  // فقط ساختار canonical: funds[networkId]
  // ============================================
  getAllFunds(project) {
    if (!project) return {};

    const funds = project.attributes?.funds || {};
    const allFunds = {};

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

    return allFunds;
  }

  // ============================================
  // به‌روزرسانی خزانه
  // فقط funds[networkId]
  // ============================================
  async updateProjectFunds(projectId, networkId, fundData) {
    if (!this.projects) {
      await this.loadProjects();
    }

    const project = await this.getProjectById(projectId);
    if (!project) {
      throw new Error(`پروژه ${projectId} یافت نشد`);
    }

    if (!networkId) {
      throw new Error('networkId الزامی است');
    }

    if (!fundData?.address) {
      throw new Error('آدرس خزانه الزامی است');
    }

    const attr = project.attributes || (project.attributes = {});

    if (!attr.funds || typeof attr.funds !== 'object') {
      attr.funds = {};
    }

    attr.funds[networkId] = {
      address: fundData.address,
      multisigAddress: fundData.multisigAddress || null,
      owners: Array.isArray(fundData.owners) ? fundData.owners : [],
      requiredSignatures: fundData.requiredSignatures || 1,
      createdAt: fundData.createdAt || new Date().toISOString(),
      network: networkId,
      isMultisig: !!(
        fundData.multisigAddress ||
        (Array.isArray(fundData.owners) && fundData.owners.length > 1)
      )
    };

    console.log(`✅ خزانه پروژه ${projectId} در شبکه ${networkId} به‌روز شد`);
    console.log(`   funds[${networkId}].address = ${fundData.address}`);

    if (fundData.multisigAddress) {
      console.log(
        `   funds[${networkId}].multisigAddress = ${fundData.multisigAddress}`
      );
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
        throw new Error(
          errorData.error || errorData.message || 'خطا در آپلود به GitHub'
        );
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
      this.projects.features?.filter(f => this.hasFund(f, networkId)) || []
    );
  }

  getProjectStatus(projectId, networkId) {
    const project = this.projects?.features?.find(
      f => f.attributes?.ProjectID === projectId
    );

    if (!project) return 'not_found';

    const fund = project.attributes?.funds?.[networkId];

    if (fund?.address) return 'active';

    if (fund && fund.address === null) return 'pending';

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
