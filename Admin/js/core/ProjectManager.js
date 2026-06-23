// Admin/js/core/ProjectManager.js

export class ProjectManager {
    constructor() {
        this.projects = null;
        
        // تشخیص محیط (محلی یا GitHub Pages)
        const isGitHubPages = window.location.hostname.includes('github.io');
        const repoName = '/ClassChain';
        
        if (isGitHubPages) {
            this.jsonPath = `${repoName}/frontend/data/Projects.json`;
            this.basePath = `${repoName}/frontend/data/`;
        } else {
            this.jsonPath = '/ClassChain/frontend/data/Projects.json';
            this.basePath = '/ClassChain/frontend/data/';
        }
        
        // مسیرهای جایگزین
        this.paths = [
            this.jsonPath,
            '/ClassChain/frontend/data/Projects.json',
            '../../frontend/data/Projects.json',
            '/frontend/data/Projects.json'
        ];
        
        // نگاشت شبکه‌ها به فیلدهای JSON
        this.networkFieldMapping = {
            'polygon_amoy': 'contractAddress',
            'polygon_mainnet': 'contractAddressMainnet',
            'ethereum_sepolia': 'contractAddressEthereum',
            'ethereum_mainnet': 'contractAddressEthereum',
            'tron_nile': 'contractAddressTron',
            'tron_mainnet': 'contractAddressTron',
            'bsc_testnet': 'contractAddressBSC',
            'bsc_mainnet': 'contractAddressBSC',
            'arbitrum_testnet': 'contractAddressArbitrum',
            'arbitrum_mainnet': 'contractAddressArbitrum',
            'optimism_testnet': 'contractAddressOptimism',
            'optimism_mainnet': 'contractAddressOptimism',
            'avalanche_testnet': 'contractAddressAvalanche',
            'avalanche_mainnet': 'contractAddressAvalanche',
            'solana_testnet': 'contractAddressSolana',
            'solana_mainnet': 'contractAddressSolana'
        };
        
        // فیلد Multisig
        this.multisigField = 'multisigAddress';
        
        console.log(`🌐 محیط: ${isGitHubPages ? 'GitHub Pages' : 'محلی'}`);
        console.log(`📁 مسیر اصلی: ${this.jsonPath}`);
    }

    // ============================================
    // بارگذاری پروژه‌ها
    // ============================================

    async loadProjects() {
        let lastError = null;
        
        for (const path of this.paths) {
            try {
                console.log(`🔄 تلاش برای بارگذاری از: ${path}`);
                
                const response = await fetch(path, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    }
                });
                
                if (response.ok) {
                    this.projects = await response.json();
                    
                    if (!this.projects.features || !Array.isArray(this.projects.features)) {
                        throw new Error('ساختار داده نامعتبر: features وجود ندارد');
                    }
                    
                    console.log(`✅ پروژه‌ها بارگذاری شدند از: ${path}`);
                    console.log(`📊 تعداد: ${this.projects.features.length} پروژه`);
                    
                    // نمایش آمار خزانه‌ها
                    this._logFundStatistics();
                    
                    this.jsonPath = path;
                    return this.projects;
                } else {
                    console.warn(`⚠️ مسیر ${path} پاسخ داد: ${response.status}`);
                    lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                console.warn(`❌ مسیر ${path} کار نکرد:`, error.message);
                lastError = error;
            }
        }
        
        console.error('❌ همه مسیرها شکست خوردند');
        throw new Error(`هیچ مسیری برای Projects.json کار نکرد. آخرین خطا: ${lastError?.message || 'نامشخص'}`);
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
                if (attr[field] && attr[field] !== 'null' && attr[field] !== '') {
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
        const field = this.networkFieldMapping[networkId];
        
        if (!field) {
            console.warn(`⚠️ نگاشت برای شبکه ${networkId} وجود ندارد`);
            return null;
        }
        
        const address = attr[field];
        // بررسی اینکه آدرس معتبر باشد (نه null و نه رشته خالی)
        if (address && address !== 'null' && address !== '') {
            return address;
        }
        
        return null;
    }

    // ============================================
    // دریافت آدرس Multisig
    // ============================================

    getMultisigAddress(project) {
        if (!project) return null;
        const address = project.attributes[this.multisigField];
        if (address && address !== 'null' && address !== '') {
            return address;
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
        
        const funds = {};
        const attr = project.attributes;
        
        Object.keys(this.networkFieldMapping).forEach(networkId => {
            const field = this.networkFieldMapping[networkId];
            const address = attr[field];
            if (address && address !== 'null' && address !== '') {
                funds[networkId] = {
                    address: address,
                    networkId: networkId,
                    field: field
                };
            }
        });
        
        // اضافه کردن Multisig اگر وجود دارد
        const multisig = this.getMultisigAddress(project);
        if (multisig) {
            funds._multisig = multisig;
        }
        
        return funds;
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
        
        if (!field) {
            throw new Error(`شبکه ${networkId} پشتیبانی نمی‌شود`);
        }

        // به‌روزرسانی آدرس خزانه
        attr[field] = fundData.address;

        // اگر Multisig است، آدرس آن را ذخیره کن
        if (fundData.multisigAddress) {
            attr[this.multisigField] = fundData.multisigAddress;
        }

        // اگر مالکان وجود دارند، می‌توانیم در فیلد جداگانه ذخیره کنیم (اختیاری)
        if (fundData.owners && fundData.owners.length > 0) {
            // برای سازگاری، می‌توانیم در یک فیلد جدید ذخیره کنیم
            // اما از آنجایی که نمی‌خواهیم ساختار را تغییر دهیم، این کار را نمی‌کنیم
            // یا می‌توانیم در یک فیلد comment ذخیره کنیم
            // attr.owners = fundData.owners; // اگر فیلد وجود داشته باشد
        }

        console.log(`✅ خزانه پروژه ${projectId} در شبکه ${networkId} به‌روز شد`);
        console.log(`   آدرس: ${fundData.address}`);
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
    // GitHub API
    // ============================================

    async pushToGitHub(jsonContent, message = 'به‌روزرسانی پروژه‌ها') {
        const GITHUB_TOKEN = localStorage.getItem('github_token');
        if (!GITHUB_TOKEN) {
            throw new Error('توکن GitHub تنظیم نشده است');
        }

        const REPO = 'classchain/ClassChain';
        const PATH = 'frontend/data/Projects.json';

        try {
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

    // ============================================
    // توابع کمکی برای UI
    // ============================================

    getProjectsByNetwork(networkId) {
        if (!this.projects) return [];
        
        return this.projects.features?.filter(f => {
            return this.hasFund(f, networkId);
        }) || [];
    }

    getProjectStatus(projectId, networkId) {
        const project = this.projects?.features?.find(
            f => f.attributes?.ProjectID === projectId
        );
        
        if (!project) return 'not_found';
        
        if (this.hasFund(project, networkId)) {
            return 'active';
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
