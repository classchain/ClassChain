// js/core/ProjectManager.js
export class ProjectManager {
  constructor() {
    this.projects = null;
    this.jsonPath = 'data/Projects.json';
  }

  async loadProjects() {
    try {
      const response = await fetch(this.jsonPath);
      this.projects = await response.json();
      return this.projects;
    } catch (error) {
      console.error('خطا در بارگذاری پروژه‌ها:', error);
      throw new Error('امکان بارگذاری پروژه‌ها وجود ندارد');
    }
  }

  async getProjectById(projectId) {
    if (!this.projects) await this.loadProjects();
    return this.projects.features.find(
      f => f.attributes.ProjectID === projectId
    );
  }

  async updateProjectFunds(projectId, networkId, fundData) {
    if (!this.projects) await this.loadProjects();

    const project = await this.getProjectById(projectId);
    if (!project) {
      throw new Error(`پروژه ${projectId} یافت نشد`);
    }

    // ساختار جدید funds
    if (!project.attributes.funds) {
      project.attributes.funds = {};
    }

    project.attributes.funds[networkId] = {
      address: fundData.address,
      multisigAddress: fundData.multisigAddress || null,
      owners: fundData.owners || [],
      requiredSignatures: fundData.requiredSignatures || 1,
      createdAt: new Date().toISOString(),
      network: networkId,
      isMultisig: !!fundData.multisigAddress
    };

    // به‌روزرسانی فیلدهای قدیمی برای سازگاری
    this._updateLegacyFields(project, networkId, fundData.address);

    return this.projects;
  }

  _updateLegacyFields(project, networkId, address) {
    const legacyMapping = {
      'polygon_amoy': 'contractAddress',
      'polygon_mainnet': 'contractAddressMainnet',
      'tron_nile': 'contractAddressTron',
      'tron_mainnet': 'contractAddressTron',
      'ethereum_sepolia': 'contractAddressEthereum',
      'ethereum_mainnet': 'contractAddressEthereum',
      'bsc_testnet': 'contractAddressBSC',
      'bsc_mainnet': 'contractAddressBSC'
    };

    const fieldName = legacyMapping[networkId];
    if (fieldName) {
      project.attributes[fieldName] = address;
    }
  }

  async saveProjects(updatedJson) {
    // این تابع می‌تواند:
    // 1. فایل را برای دانلود ارائه دهد
    // 2. از طریق GitHub API ذخیره کند
    // 3. یا هر دو

    // فعلاً JSON را برمی‌گردانیم
    return JSON.stringify(this.projects, null, 2);
  }

  // GitHub API integration
  async pushToGitHub(jsonContent, message = 'به‌روزرسانی پروژه‌ها') {
    // نیاز به توکن GitHub و تنظیمات repo دارد
    const GITHUB_TOKEN = localStorage.getItem('github_token');
    if (!GITHUB_TOKEN) {
      throw new Error('توکن GitHub تنظیم نشده است');
    }

    const REPO = 'your-username/your-repo';
    const PATH = 'data/Projects.json';

    const response = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          content: btoa(unescape(encodeURIComponent(jsonContent))),
          sha: await this._getFileSha()
        })
      }
    );

    if (!response.ok) {
      throw new Error('خطا در آپلود به GitHub');
    }

    return await response.json();
  }

  async _getFileSha() {
    const REPO = 'your-username/your-repo';
    const PATH = 'data/Projects.json';
    const GITHUB_TOKEN = localStorage.getItem('github_token');

    const response = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.sha;
    }
    return null;
  }

  getProjectsByNetwork(networkId) {
    if (!this.projects) return [];
    
    return this.projects.features.filter(f => {
      const funds = f.attributes.funds || {};
      return funds[networkId] && funds[networkId].address;
    });
  }

  getProjectStatus(projectId, networkId) {
    const project = this.projects?.features.find(
      f => f.attributes.ProjectID === projectId
    );
    
    if (!project) return 'not_found';
    
    const funds = project.attributes.funds || {};
    const fund = funds[networkId];
    
    if (fund && fund.address) {
      return 'active';
    } else if (fund && fund.address === null) {
      return 'pending';
    }
    return 'not_created';
  }
}
