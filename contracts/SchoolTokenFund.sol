// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SchoolTokenFund is Ownable {
    // توکن‌های مجاز (روی Polygon Mainnet یا Amoy)
    address public constant USDT_MAINNET = 0xc2132D05D31c914a87C6611C10748AEb04B58e8F;
    address public constant USDT_AMOY = 0x41e94eb019c0762f9bfcf9fb78e59bec0a32e187;
    address public constant CLC = 0x39Af73d2736f6EC94778a38c0C7Ef800e58B13a7;

    mapping(address => bool) public allowedTokens;

    event TokensReceived(address indexed token, address indexed from, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    constructor(address[] memory initialOwners) {
        // owner اولیه factory یا چند owner
        _transferOwnership(msg.sender); // یا multi-owner پیشرفته‌تر

        allowedTokens[USDT_MAINNET] = true;
        allowedTokens[USDT_AMOY] = true;
        allowedTokens[CLC] = true;
    }

    // فقط توکن‌های مجاز رو قبول کن
    receive() external payable {
        revert("Native MATIC not accepted");
    }

    fallback() external payable {
        revert("Only allowed ERC20 tokens");
    }

    // وقتی توکن ERC20 transfer می‌شه به این قرارداد
    function onERC20Received(address token, uint256 amount) internal {
        if (!allowedTokens[token]) {
            // اگر توکن غیرمجاز باشه، revert کن (توکن برمی‌گرده به فرستنده)
            revert("Token not allowed: Only USDT (Main/Amoy) or CLC accepted");
        }
        emit TokensReceived(token, msg.sender, amount);
    }

    // تابع عمومی برای دریافت توکن (اختیاری)
    function depositToken(address token, uint256 amount) external {
        if (!allowedTokens[token]) revert("Token not allowed");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit TokensReceived(token, msg.sender, amount);
    }

    // withdraw فقط توسط owner (یا multi-sig در نسخه پیشرفته)
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        if (!allowedTokens[token]) revert("Cannot withdraw disallowed token");
        IERC20(token).transfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    // موجودی توکن مجاز
    function balanceOf(address token) external view returns (uint256) {
        if (!allowedTokens[token]) return 0;
        return IERC20(token).balanceOf(address(this));
    }
}