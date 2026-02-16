// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Interface ساده برای توکن‌های TRC-20 (معادل IERC20)
interface ITRC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// Ownable ساده (بدون وابستگی به OpenZeppelin)
contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

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
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

contract TronSchoolTokenFund is Ownable {
    mapping(address => bool) public allowedTokens;

    // آدرس رسمی USDT TRC-20 روی Tron Mainnet (در فرمت hex)
    //address public constant USDT_TOKEN = 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C;
    //address public immutable usdtTokenNile = 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C; // hex همان Base58 TXYZ... است
    //address public immutable usdtTokenNile = 0xeca9bc828a3005b9a3b909f2cc5c2a54794de05f;
    address public immutable usdtTokenNile = 0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F;
    mapping(address => mapping(address => uint256)) public donorContributions;
    mapping(address => uint256) public totalDonorContributions;

    event TokensReceived(address indexed token, address indexed donor, uint256 amount);
    event TokenAllowanceUpdated(address indexed token, bool allowed);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    constructor(address[] memory _initialAllowedTokens) {
        // اضافه کردن توکن‌های پیش‌فرض از کارخانه
        for (uint256 i = 0; i < _initialAllowedTokens.length; i++) {
            if (_initialAllowedTokens[i] != address(0)) {
                allowedTokens[_initialAllowedTokens[i]] = true;
                emit TokenAllowanceUpdated(_initialAllowedTokens[i], true);
            }
        }
        if (!allowedTokens[usdtTokenNile]) {
            allowedTokens[usdtTokenNile] = true;
            emit TokenAllowanceUpdated(usdtTokenNile, true);
        }
        // همیشه USDT را مجاز کن
        //if (!allowedTokens[USDT_TOKEN]) {
        //    allowedTokens[USDT_TOKEN] = true;
        //    emit TokenAllowanceUpdated(USDT_TOKEN, true);
        //}
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

        bool success = ITRC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Transfer failed");

        donorContributions[msg.sender][token] += amount;
        totalDonorContributions[msg.sender] += amount;

        emit TokensReceived(token, msg.sender, amount);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        require(allowedTokens[token], "Cannot withdraw disallowed token");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");

        uint256 balance = ITRC20(token).balanceOf(address(this));
        require(balance >= amount, "Insufficient balance");

        bool success = ITRC20(token).transfer(to, amount);
        require(success, "Transfer failed");

        emit Withdrawn(token, to, amount);
    }

    function balanceOf(address token) external view returns (uint256) {
        if (!allowedTokens[token]) return 0;
        return ITRC20(token).balanceOf(address(this));
    }

    function getDonorContribution(address donor) external view returns (uint256) {
        return totalDonorContributions[donor];
    }

    function updateAllowedToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "Invalid token address");
        allowedTokens[token] = allowed;
        emit TokenAllowanceUpdated(token, allowed);
    }
}
