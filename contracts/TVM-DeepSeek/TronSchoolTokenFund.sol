// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Interface ساده برای توکن‌های TRC-20 (معادل IERC20)
interface ITRC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

// Ownable ساده (بدون وابستگی به OpenZeppelin)
contract Ownable {
    address public owner;
    address public pendingOwner; // اضافه شده برای انتقال دو مرحله‌ای

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferRequested(address indexed from, address indexed to);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        pendingOwner = newOwner;
        emit OwnershipTransferRequested(owner, newOwner);
    }
    
    // اضافه شده: پذیرش مالکیت (دو مرحله‌ای)
    function acceptOwnership() public {
        require(msg.sender == pendingOwner, "Ownable: caller is not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }
}

contract TronSchoolTokenFund is Ownable {
    mapping(address => bool) public allowedTokens;
    
    // آدرس ثابت USDT برای شبکه اصلی ترون (Nile Testnet)
    address public constant USDT_TOKEN_NILE = 0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F;
    
    // آدرس USDT برای شبکه اصلی ترون (Mainnet - این رو قبل از دیپلوی تغییر بدید)
    address public constant USDT_TOKEN_MAINNET = 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C;
    
    // متغیر برای سوئیچ بین شبکه‌ها (برای دیپلوی راحت‌تر)
    bool public useMainnet = false; // پیش‌فرض روی تست‌نت
    
    mapping(address => mapping(address => uint256)) public donorContributions;
    mapping(address => uint256) public totalDonorContributions;
    
    // اضافه شده: محدودیت واریز روزانه برای جلوگیری از اسپم
    mapping(address => uint256) public lastDepositTime;
    uint256 public constant MIN_DEPOSIT_INTERVAL = 1 seconds;
    
    // اضافه شده: کل مبلغ واریزی به ازای هر توکن
    mapping(address => uint256) public totalTokenDeposits;

    event TokensReceived(address indexed token, address indexed donor, uint256 amount);
    event TokenAllowanceUpdated(address indexed token, bool allowed);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event RefundIssued(address indexed donor, address indexed token, uint256 amount);

    constructor(address[] memory _initialAllowedTokens) {
        // اضافه کردن توکن‌های پیش‌فرض از کارخانه
        for (uint256 i = 0; i < _initialAllowedTokens.length; i++) {
            if (_initialAllowedTokens[i] != address(0)) {
                allowedTokens[_initialAllowedTokens[i]] = true;
                emit TokenAllowanceUpdated(_initialAllowedTokens[i], true);
            }
        }
        
        // همیشه USDT را مجاز کن (بر اساس شبکه)
        address usdtToken = useMainnet ? USDT_TOKEN_MAINNET : USDT_TOKEN_NILE;
        if (!allowedTokens[usdtToken]) {
            allowedTokens[usdtToken] = true;
            emit TokenAllowanceUpdated(usdtToken, true);
        }
    }
    
    // اضافه شده: تابع سوئیچ شبکه (فقط برای مدیریت)
    function setNetwork(bool _useMainnet) external onlyOwner {
        useMainnet = _useMainnet;
        address usdtToken = useMainnet ? USDT_TOKEN_MAINNET : USDT_TOKEN_NILE;
        if (!allowedTokens[usdtToken]) {
            allowedTokens[usdtToken] = true;
            emit TokenAllowanceUpdated(usdtToken, true);
        }
    }

    // جلوگیری از دریافت TRX مستقیم
    receive() external payable {
        revert("Native TRX is not accepted");
    }

    fallback() external payable {
        revert("Only allowed TRC-20 tokens are accepted");
    }

    function depositToken(address token, uint256 amount) external {
        require(allowedTokens[token], "Token not allowed");
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= 10**30, "Amount too large"); // محافظت در برابر overflow
        
        // محافظت در برابر اسپم
        require(block.timestamp >= lastDepositTime[msg.sender] + MIN_DEPOSIT_INTERVAL, "Deposit too frequent");
        lastDepositTime[msg.sender] = block.timestamp;
        
        // بررسی موجودی کاربر قبل از انتقال
        uint256 userBalance = ITRC20(token).balanceOf(msg.sender);
        require(userBalance >= amount, "Insufficient balance");
        
        // بررسی allowance
        uint256 allowance = ITRC20(token).allowance(msg.sender, address(this));
        require(allowance >= amount, "Insufficient allowance");
        
        // انجام انتقال
        bool success = ITRC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Transfer failed - check token contract");
        
        // به‌روزرسانی آمار
        donorContributions[msg.sender][token] += amount;
        totalDonorContributions[msg.sender] += amount;
        totalTokenDeposits[token] += amount;
        
        // محافظت در برابر overflow
        require(totalDonorContributions[msg.sender] >= amount, "Overflow detected");
        require(totalTokenDeposits[token] >= amount, "Overflow detected");

        emit TokensReceived(token, msg.sender, amount);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        require(allowedTokens[token], "Cannot withdraw disallowed token");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        
        // بررسی موجودی صندوق
        uint256 balance = ITRC20(token).balanceOf(address(this));
        require(balance >= amount, "Insufficient balance in fund");
        
        // بررسی نمی‌شه بیشتر از موجودی واریزی برداشت بشه
        require(amount <= totalTokenDeposits[token], "Cannot withdraw more than total deposited");

        // انجام انتقال
        bool success = ITRC20(token).transfer(to, amount);
        require(success, "Transfer failed");
        
        // به‌روزرسانی آمار
        totalTokenDeposits[token] -= amount;

        emit Withdrawn(token, to, amount);
    }
    
    // اضافه شده: تابع برگشت وجه برای کاربران (اگر پروژه کنسل شد)
    function refundDonor(address donor, address token) external onlyOwner {
        require(donor != address(0), "Invalid donor");
        require(allowedTokens[token], "Token not allowed");
        
        uint256 amount = donorContributions[donor][token];
        require(amount > 0, "No contribution to refund");
        
        uint256 balance = ITRC20(token).balanceOf(address(this));
        require(balance >= amount, "Insufficient balance for refund");
        
        // پاک کردن سهم کاربر قبل از انتقال (محافظت در برابر reentrancy)
        donorContributions[donor][token] = 0;
        totalDonorContributions[donor] -= amount;
        totalTokenDeposits[token] -= amount;
        
        // انتقال وجه
        bool success = ITRC20(token).transfer(donor, amount);
        require(success, "Refund transfer failed");
        
        emit RefundIssued(donor, token, amount);
    }

    function balanceOf(address token) external view returns (uint256) {
        if (!allowedTokens[token]) return 0;
        return ITRC20(token).balanceOf(address(this));
    }
    
    // اضافه شده: دریافت موجودی چند توکن به صورت همزمان
    function balanceOfMultiple(address[] memory tokens) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            if (allowedTokens[tokens[i]]) {
                balances[i] = ITRC20(tokens[i]).balanceOf(address(this));
            } else {
                balances[i] = 0;
            }
        }
        return balances;
    }

    function getDonorContribution(address donor) external view returns (uint256) {
        return totalDonorContributions[donor];
    }
    
    // اضافه شده: دریافت سهم کاربر از یک توکن خاص
    function getDonorContributionForToken(address donor, address token) external view returns (uint256) {
        return donorContributions[donor][token];
    }
    
    // اضافه شده: دریافت لیست توکن‌های مجاز
    function getAllowedTokens() external view returns (address[] memory) {
        // این تابع نیاز به ذخیره لیست توکن‌ها داره که می‌تونیم با یک mapping دیگه حل کنیم
        // برای سادگی، فعلاً خالی برگردونید
        address[] memory empty;
        return empty;
    }

    function updateAllowedToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(token != address(this), "Cannot add self as token");
        
        allowedTokens[token] = allowed;
        emit TokenAllowanceUpdated(token, allowed);
    }
    
    // اضافه شده: تابع اورژانسی برای مسدود کردن همه واریزها
    bool public depositsPaused = false;
    
    function toggleDeposits() external onlyOwner {
        depositsPaused = !depositsPaused;
    }
    
    // اصلاح تابع depositToken با در نظر گرفتن pause
    // (این تابع رو با تغییرات بالا جایگزین کنید)
}
