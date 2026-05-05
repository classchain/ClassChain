// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TronSchoolTokenFund.sol";
import "./TronMultiSigWallet.sol";

contract TronSchoolFundFactory is Ownable {
    mapping(string => address) public projectFunds;
    mapping(address => string) public fundToProjectId; // اضافه شده: نگاشت معکوس
    
    address[] public defaultAllowedTokens;
    
    // آدرس رسمی USDT برای شبکه‌های مختلف
    address public constant USDT_NILE = 0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F;
    address public constant USDT_MAINNET = 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C;
    
    // سوئیچ شبکه
    bool public useMainnet = false;
    
    // رویدادهای اضافه شده
    event FundCreated(
        string indexed projectId,
        address indexed fundAddress,
        address indexed ownerOrMultisig,
        bool isMultisig,
        uint256 requiredConfirmations
    );
    
    event FundClosed(string indexed projectId);
    event NetworkSwitched(bool indexed useMainnet);

    constructor(address[] memory _defaultAllowedTokens) {
        // اطمینان از صحت آدرس‌ها
        for (uint i = 0; i < _defaultAllowedTokens.length; i++) {
            require(_defaultAllowedTokens[i] != address(0), "Invalid token address");
            defaultAllowedTokens.push(_defaultAllowedTokens[i]);
        }
        
        // اضافه کردن USDT متناسب با شبکه فعلی
        _ensureUSDTInAllowedTokens();
    }
    
    function _ensureUSDTInAllowedTokens() private {
        address usdtToken = useMainnet ? USDT_MAINNET : USDT_NILE;
        bool usdtAdded = false;
        
        for (uint i = 0; i < defaultAllowedTokens.length; i++) {
            if (defaultAllowedTokens[i] == usdtToken) {
                usdtAdded = true;
                break;
            }
        }
        
        if (!usdtAdded) {
            defaultAllowedTokens.push(usdtToken);
        }
    }
    
    // اضافه شده: تابع سوئیچ شبکه
    function setNetwork(bool _useMainnet) external onlyOwner {
        require(useMainnet != _useMainnet, "Network already set to this value");
        useMainnet = _useMainnet;
        _ensureUSDTInAllowedTokens();
        emit NetworkSwitched(_useMainnet);
    }
    
    // اضافه شده: گرفتن آدرس USDT بر اساس شبکه فعلی
    function getCurrentUSDT() public view returns (address) {
        return useMainnet ? USDT_MAINNET : USDT_NILE;
    }

    function createSingleOwnerFund(
        string memory projectId,
        address singleOwner
    ) external onlyOwner returns (address fundAddress) {
        require(projectFunds[projectId] == address(0), "Fund already exists");
        require(singleOwner != address(0), "Invalid owner");
        require(bytes(projectId).length > 0, "Project ID cannot be empty");
        require(bytes(projectId).length <= 64, "Project ID too long");
        
        // کپی از توکن‌های مجاز فعلی
        address[] memory allowedTokensCopy = new address[](defaultAllowedTokens.length);
        for (uint i = 0; i < defaultAllowedTokens.length; i++) {
            allowedTokensCopy[i] = defaultAllowedTokens[i];
        }
        
        TronSchoolTokenFund fund = new TronSchoolTokenFund(allowedTokensCopy);
        
        // تنظیم شبکه در صندوق جدید
        if (useMainnet) {
            fund.setNetwork(true);
        }
        
        fund.transferOwnership(singleOwner);

        projectFunds[projectId] = address(fund);
        fundToProjectId[address(fund)] = projectId;
        
        emit FundCreated(projectId, address(fund), singleOwner, false, 0);

        return address(fund);
    }

    function createMultisigFund(
        string memory projectId,
        address[] memory multisigOwners,
        uint256 requiredConfirmations
    ) external onlyOwner returns (address fundAddress, address multisigAddress) {
        require(projectFunds[projectId] == address(0), "Fund already exists");
        require(multisigOwners.length > 0, "Owners required");
        require(multisigOwners.length <= 50, "Too many owners"); // محدودیت برای جلوگیری از مشکلات gas
        require(
            requiredConfirmations > 0 && requiredConfirmations <= multisigOwners.length,
            "Invalid required confirmations"
        );
        require(bytes(projectId).length > 0, "Project ID cannot be empty");
        
        // بررسی unique بودن مالک‌ها
        for (uint i = 0; i < multisigOwners.length; i++) {
            require(multisigOwners[i] != address(0), "Invalid owner address");
            for (uint j = i + 1; j < multisigOwners.length; j++) {
                require(multisigOwners[i] != multisigOwners[j], "Duplicate owner");
            }
        }
        
        // کپی از توکن‌های مجاز فعلی
        address[] memory allowedTokensCopy = new address[](defaultAllowedTokens.length);
        for (uint i = 0; i < defaultAllowedTokens.length; i++) {
            allowedTokensCopy[i] = defaultAllowedTokens[i];
        }
        
        TronMultiSigWallet multisig = new TronMultiSigWallet(multisigOwners, requiredConfirmations);

        TronSchoolTokenFund fund = new TronSchoolTokenFund(allowedTokensCopy);
        
        // تنظیم شبکه در صندوق جدید
        if (useMainnet) {
            fund.setNetwork(true);
        }
        
        fund.transferOwnership(address(multisig));

        projectFunds[projectId] = address(fund);
        fundToProjectId[address(fund)] = projectId;
        
        emit FundCreated(projectId, address(fund), address(multisig), true, requiredConfirmations);

        return (address(fund), address(multisig));
    }
    
    // اضافه شده: تابع غیرفعال کردن صندوق (بستن پروژه)
    function closeFund(string memory projectId) external onlyOwner {
        address fundAddress = projectFunds[projectId];
        require(fundAddress != address(0), "Fund does not exist");
        
        // انتقال مالکیت به آدرس صفر برای قفل کردن صندوق
        TronSchoolTokenFund(fundAddress).transferOwnership(address(0));
        
        delete projectFunds[projectId];
        delete fundToProjectId[fundAddress];
        
        emit FundClosed(projectId);
    }
    
    // اضافه شده: دریافت اطلاعات کامل یک صندوق
    function getFundInfo(string memory projectId) external view returns (
        address fundAddress,
        bool exists,
        bool isActive
    ) {
        fundAddress = projectFunds[projectId];
        exists = fundAddress != address(0);
        
        if (exists) {
            // بررسی فعال بودن (مالک صفر نباشد)
            TronSchoolTokenFund fund = TronSchoolTokenFund(fundAddress);
            isActive = fund.owner() != address(0);
        }
        
        return (fundAddress, exists, isActive);
    }

    function getFundAddress(string memory projectId) external view returns (address) {
        return projectFunds[projectId];
    }
    
    // اضافه شده: دریافت پروژه آیدی از آدرس صندوق
    function getProjectIdFromFund(address fundAddress) external view returns (string memory) {
        return fundToProjectId[fundAddress];
    }
    
    // اضافه شده: دریافت تعداد کل پروژه‌ها
    function getTotalProjects() external view returns (uint) {
        // این تابع نیاز به نگهداری آرایه جداگانه داره
        // برای سادگی، فعلاً 0 برگردونید
        return 0;
    }

    function updateDefaultAllowedTokens(address[] memory newTokens) external onlyOwner {
        require(newTokens.length > 0, "At least one token required");
        require(newTokens.length <= 100, "Too many tokens");
        
        // بررسی آدرس‌های تکراری و نامعتبر
        for (uint i = 0; i < newTokens.length; i++) {
            require(newTokens[i] != address(0), "Invalid token address");
            for (uint j = i + 1; j < newTokens.length; j++) {
                require(newTokens[i] != newTokens[j], "Duplicate token");
            }
        }
        
        defaultAllowedTokens = newTokens;
        _ensureUSDTInAllowedTokens(); // مطمئن شویم USDT حذف نشده
    }
    
    // اضافه شده: اضافه کردن توکن به لیست پیش‌فرض
    function addDefaultToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        
        // چک کردن تکراری نبودن
        for (uint i = 0; i < defaultAllowedTokens.length; i++) {
            if (defaultAllowedTokens[i] == token) {
                revert("Token already in list");
            }
        }
        
        defaultAllowedTokens.push(token);
    }
    
    // اضافه شده: حذف توکن از لیست پیش‌فرض (به جز USDT)
    function removeDefaultToken(address token) external onlyOwner {
        address currentUSDT = getCurrentUSDT();
        require(token != currentUSDT, "Cannot remove USDT from allowed tokens");
        
        uint indexToRemove = defaultAllowedTokens.length;
        for (uint i = 0; i < defaultAllowedTokens.length; i++) {
            if (defaultAllowedTokens[i] == token) {
                indexToRemove = i;
                break;
            }
        }
        
        require(indexToRemove < defaultAllowedTokens.length, "Token not found");
        
        // حذف با جابجایی و pop
        for (uint i = indexToRemove; i < defaultAllowedTokens.length - 1; i++) {
            defaultAllowedTokens[i] = defaultAllowedTokens[i + 1];
        }
        defaultAllowedTokens.pop();
    }
}
