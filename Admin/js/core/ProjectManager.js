// js/core/ProjectManager.js
export class ProjectManager {
  constructor() {
    this.projects = null;
    this.jsonPath = '/ClassChain/frontend/data/Projects.json';
    this.basePath = '/ClassChain/frontend/data/'; // برای فایل‌های دیگر
        // ============================================
        // نگاشت شبکه‌ها به فیلدهای JSON
        // ============================================
        this.networkFieldMapping = {
            'polygon_amoy': 'contractAddress',
            'polygon_mainnet': 'contractAddressMainnet',
            'tron_nile': 'contractAddressTron',
            'tron_mainnet': 'contractAddressTron',
            'ethereum_sepolia': 'contractAddressEthereum',
            'ethereum_mainnet': 'contractAddressEthereum',
            'bsc_testnet': 'contractAddressBSC',
            'bsc_mainnet': 'contractAddressBSC',
            'arbitrum_testnet': 'contractAddressArbitrum',
            'arbitrum_mainnet': 'contractAddressArbitrum',
            'optimism_testnet': 'contractAddressOptimism',
            'optimism_mainnet': 'contractAddressOptimism',
            'avalanche_testnet': 'contractAddressAvalanche',
            'avalanche_mainnet': 'contractAddressAvalanche',
            'solana_testnet': 'contractAddressSolana',
            'solana_mainnet': 'contractAddressSolana',
            'clc': 'contractAddressCLC'
        };
        
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
                    'Accept': 'application/json',
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
            
            // نمایش آمار خزانه‌ها
            this._logFundStatistics();
            
            return this.projects;
            
        } catch (error) {
            console.error('❌ خطا در بارگذاری پروژه‌ها:', error);
            throw new Error('امکان بارگذاری پروژه‌ها وجود ندارد. لطفاً مسیر فایل را بررسی کنید.');
        }
    }

    // ============================================
    // آمار خزانه‌ها (برای دیباگ)
    // ============================================

    _logFundStatistics() {
        if (!this.projects) return;
        
        let totalFunds = 0;
        const networkStats = {};
        
        this.projects.features.forEach(f => {
            const attr = f.attributes;
            Object.keys(this.networkFieldMapping).forEach(networkId => {
                const field = this.networkFieldMapping[networkId];
                const address = attr[field];
                if (address && address !== 'null' && address !== '') {
                    totalFunds++;
                    networkStats[networkId] = (networkStats[networkId] || 0) + 1;
                }
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
    // دریافت آدرس خزانه در یک شبکه خاص
    // ============================================

    getFundAddress(project, networkId) {
        if (!project) return null;
        
        const attr = project.attributes;
        
        // 1️⃣ اول از ساختار قدیمی (فیلدهای contractAddress*) چک کن
        const field = this.networkFieldMapping[networkId];
        if (field) {
            const address = attr[field];
            if (address && address !== 'null' && address !== '') {
                return address;
            }
        }
        
        // 2️⃣ اگر نبود، از ساختار جدید (funds) چک کن
        const funds = attr.funds || {};
        const fund = funds[networkId];
        if (fund && fund.address && fund.address !== 'null' && fund.address !== '') {
            return fund.address;
        }
        
        return null;
    }

    // ============================================
    // دریافت آدرس Multisig
    // ============================================

    getMultisigAddress(project) {
        if (!project) return null;
        const attr = project.attributes;
        
        // از فیلد multisigAddress چک کن
        const address = attr[this.multisigField];
        if (address && address !== 'null' && address !== '') {
            return address;
        }
        
        // از ساختار funds چک کن
        const funds = attr.funds || {};
        for (const networkId in funds) {
            const fund = funds[networkId];
            if (fund && fund.multisigAddress && fund.multisigAddress !== 'null' && fund.multisigAddress !== '') {
                return fund.multisigAddress;
            }
        }
        
        return null;
    }

    // ============================================
    // بررسی وجود خزانه در شبکه
    // ============================================

    hasFund(project, networkId) {
        const address = this.getFundAddress(project, networkId);
        return !!address;
    }

    // ============================================
    // دریافت همه خزانه‌های یک پروژه
    // ============================================

    getAllFunds(project) {
        if (!project) return {};
        
        const allFunds = {};
        const attr = project.attributes;
        
        // 1️⃣ از ساختار قدیمی (فیلدهای contractAddress*) بخوان
        Object.keys(this.networkFieldMapping).forEach(networkId => {
            const field = this.networkFieldMapping[networkId];
            const address = attr[field];
            if (address && address !== 'null' && address !== '') {
                allFunds[networkId] = {
                    address: address,
                    networkId: networkId,
                    field: field,
                    source: 'legacy'
                };
            }
        });
        
        // 2️⃣ از ساختار جدید (funds) بخوان
        const funds = attr.funds || {};
        Object.keys(funds).forEach(networkId => {
            const fund = funds[networkId];
            if (fund && fund.address && fund.address !== 'null' && fund.address !== '') {
                // اگر قبلاً از ساختار قدیمی اضافه شده، آپدیت کن
                if (allFunds[networkId]) {
                    allFunds[networkId] = {
                        ...allFunds[networkId],
                        ...fund,
                        source: 'both'
                    };
                } else {
                    allFunds[networkId] = {
                        ...fund,
                        networkId: networkId,
                        source: 'funds'
                    };
                }
            }
        });
        
        return allFunds;
    }

    // ============================================
    // به‌روزرسانی خزانه
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
        const field = this.networkFieldMapping[networkId];
        
        // 1️⃣ آدرس را در فیلد قدیمی ذخیره کن (سازگاری با بخش‌های دیگر)
        if (field) {
            attr[field] = fundData.address;
        }

        // 2️⃣ آدرس را در ساختار جدید funds هم ذخیره کن
        if (!attr.funds) {
            attr.funds = {};
        }
        
        attr.funds[networkId] = {
            address: fundData.address,
            multisigAddress: fundData.multisigAddress || null,
            owners: fundData.owners || [],
            requiredSignatures: fundData.requiredSignatures || 1,
            createdAt: new Date().toISOString(),
            network: networkId,
            isMultisig: !!fundData.multisigAddress
        };

        // 3️⃣ اگر Multisig است، آدرس آن را هم ذخیره کن
        if (fundData.multisigAddress) {
            attr[this.multisigField] = fundData.multisigAddress;
        }

        console.log(`✅ خزانه پروژه ${projectId} در شبکه ${networkId} به‌روز شد`);
        console.log(`   آدرس (فیلد قدیمی ${field}): ${fundData.address}`);
        console.log(`   آدرس (ساختار funds): ${fundData.address}`);
        if (fundData.multisigAddress) {
            console.log(`   Multisig: ${fundData.multisigAddress}`);
        }

        return this.projects;
    }

    // ============================================
    // ذخیره JSON
    // ============================================
    async saveProjects() {
        if (!this.projects) {
            throw new Error('داده‌های پروژه‌ها بارگذاری نشده است');
        }
        return JSON.stringify(this.projects, null, 2);
    }

  // ============================================
  //          GitHub API integration
  // ============================================
  //async pushToGitHub(jsonContent, message = 'به‌روزرسانی پروژه‌ها') {
  //    const GITHUB_TOKEN = localStorage.getItem('github_token');
  //    if (!GITHUB_TOKEN) {
  //        throw new Error('توکن GitHub تنظیم نشده است');
  //    }
  //    // ⚠️ تنظیم نام repo و مسیر فایل
    
  //    const REPO = 'classchain/ClassChain';
  //    const PATH = 'frontend/data/Projects.json';

  //    try {
  //        // دریافت SHA فایل فعلی
  //        const sha = await this._getFileSha(REPO, PATH, GITHUB_TOKEN);
  //        const response = await fetch(
  //            `https://api.github.com/repos/${REPO}/contents/${PATH}`,
  //            {
  //                method: 'PUT',
  //                headers: {
  //                    'Authorization': `token ${GITHUB_TOKEN}`,
  //                    'Content-Type': 'application/json'
  //                },
  //                body: JSON.stringify({
  //                    message: message,
  //                    content: btoa(unescape(encodeURIComponent(jsonContent))),
  //                    sha: sha
  //                })
  //            }
  //        );

  //        if (!response.ok) {
  //            const errorData = await response.json();
  //            throw new Error(errorData.message || 'خطا در آپلود به GitHub');
  //        }

  //        return await response.json();

  //    } catch (error) {
  //        console.error('❌ GitHub upload error:', error);
  //        throw error;
  //    }
  //}


  //async _getFileSha(repo, path, token) {
  //    try {
  //        const response = await fetch(
  //            `https://api.github.com/repos/${repo}/contents/${path}`,
  //            {
  //                headers: {
  //                    'Authorization': `token ${token}`
  //                }
  //            }
  //        );

  //        if (response.ok) {
  //            const data = await response.json();
  //            return data.sha;
  //        }
  //        return null;
  //    } catch (error) {
  //        return null;
  //    }
  //}

// ============================================
// GitHub API integration (از طریق Worker امن)
// ============================================

async pushToGitHub(jsonContent, message = 'به‌روزرسانی پروژه‌ها') {
  const WORKER_URL = 'https://classchain-github-proxy.classchain.workers.dev';
  const ADMIN_KEY = sessionStorage.getItem('classchain_admin_key');

  if (!ADMIN_KEY) {
    throw new Error('رمز ادمین تنظیم نشده است. لطفاً وارد شوید.');
  }

  const PATH = 'frontend/data/Projects.json';

  try {
    // دریافت SHA فایل فعلی (از طریق Worker)
    const sha = await this._getFileSha(WORKER_URL, ADMIN_KEY, PATH);

    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'X-Admin-Key': ADMIN_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: PATH,
        message: message,
        content: btoa(unescape(encodeURIComponent(jsonContent))),
        sha: sha
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
        
      return this.projects.features?.filter(f => {
          const funds = f.attributes?.funds || {};
          return funds[networkId] && funds[networkId].address;
      }) || [];
  }

  getProjectStatus(projectId, networkId) {
      const project = this.projects?.features?.find(
          f => f.attributes?.ProjectID === projectId
      );
        
      if (!project) return 'not_found';
        
      const funds = project.attributes?.funds || {};
      const fund = funds[networkId];
        
      if (fund && fund.address) {
          return 'active';
      } else if (fund && fund.address === null) {
          return 'pending';
      }
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
