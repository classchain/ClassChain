// js/core/ProjectManager.js
export class ProjectManager {
  constructor() {
    this.projects = null;
    this.jsonPath = '/ClassChain/frontend/data/Projects.json';
    this.basePath = '/ClassChain/frontend/data/'; // برای فایل‌های دیگر
  }

  async loadProjects() {
    const paths = [
        '/ClassChain/frontend/data/Projects.json',
        //'/frontend/data/Projects.json',
        //'frontend/data/Projects.json'
    ]; 
    for (const path of paths) {
        try {
            const response = await fetch(path);
            if (response.ok) {
                this.jsonPath = path;
                this.projects = await response.json();
                console.log(`✅ بارگذاری شد از: ${path}`);
                return this.projects;
            }
        } catch (e) {
            console.warn(`❌ مسیر ${path} کار نکرد`);
        }
    }
    throw new Error('هیچ مسیری برای Projects.json کار نکرد');
            try {
            console.log(`🔄 در حال بارگذاری پروژه‌ها از: ${this.jsonPath}`);
            
            const response = await fetch(this.jsonPath);
            
            if (!response.ok) {
                // اگر فایل پیدا نشد، پیام خطای دقیق
                if (response.status === 404) {
                    throw new Error(`فایل Projects.json در مسیر ${this.jsonPath} یافت نشد`);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.projects = await response.json();
            console.log(`✅ ${this.projects.features?.length || 0} پروژه بارگذاری شد`);
            return this.projects;
            
        } catch (error) {
            console.error('❌ خطا در بارگذاری پروژه‌ها:', error);
            
            // تلاش با مسیر جایگزین (اگر از root اجرا می‌شود)
            try {
                console.log('🔄 تلاش با مسیر جایگزین...');
                const fallbackResponse = await fetch('/ClassChain/frontend/data/Projects.json');
                if (fallbackResponse.ok) {
                    this.projects = await fallbackResponse.json();
                    console.log(`✅ ${this.projects.features?.length || 0} پروژه با مسیر جایگزین بارگذاری شد`);
                    return this.projects;
                }
            } catch (fallbackError) {
                console.error('❌ مسیر جایگزین نیز کار نکرد:', fallbackError);
            }
            
            throw new Error('امکان بارگذاری پروژه‌ها وجود ندارد. لطفاً مسیر فایل را بررسی کنید.');
        }
  }

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
        }
        
        return project || null;
  }

  async updateProjectFunds(projectId, networkId, fundData) {
            if (!this.projects) {
            await this.loadProjects();
        }

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

  // ============================================
  //          GitHub API integration
  // ============================================
  async pushToGitHub(jsonContent, message = 'به‌روزرسانی پروژه‌ها') {
      const GITHUB_TOKEN = localStorage.getItem('github_token');
      if (!GITHUB_TOKEN) {
          throw new Error('توکن GitHub تنظیم نشده است');
      }
      // ⚠️ تنظیم نام repo و مسیر فایل
      const REPO = 'your-username/your-repo-name'; // 🔴 تغییر دهید
      const PATH = '/ClassChain/frontend/data/Projects.json'; // مسیر در GitHub

      try {
          // دریافت SHA فایل فعلی
          const sha = await this._getFileSha(REPO, PATH, GITHUB_TOKEN);
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
                      sha: sha
                  })
              }
          );

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || 'خطا در آپلود به GitHub');
          }

          return await response.json();

      } catch (error) {
          console.error('❌ GitHub upload error:', error);
          throw error;
      }
  }


  async _getFileSha(repo, path, token) {
      try {
          const response = await fetch(
              `https://api.github.com/repos/${repo}/contents/${path}`,
              {
                  headers: {
                      'Authorization': `token ${token}`
                  }
              }
          );

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
