// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SchoolTokenFund is Ownable, ReentrancyGuard {
    mapping(address => bool) public allowedTokens;

    address public constant CLC_TOKEN = 0x39Af73d2736f6EC94778a38c0C7Ef800e58B13a7;

    mapping(address => mapping(address => uint256)) public donorContributions;
    mapping(address => uint256) public totalDonorContributions;

    event TokensReceived(address indexed token, address indexed donor, uint256 amount);
    event TokenAllowanceUpdated(address indexed token, bool allowed);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    // مهم: Ownable(msg.sender) اضافه شد برای سازگاری با OpenZeppelin v5
    constructor(address[] memory _initialAllowedTokens, bool _includeCLC) Ownable(msg.sender) {
        for (uint256 i = 0; i < _initialAllowedTokens.length; i++) {
            if (_initialAllowedTokens[i] != address(0)) {
                allowedTokens[_initialAllowedTokens[i]] = true;
                emit TokenAllowanceUpdated(_initialAllowedTokens[i], true);
            }
        }

        if (_includeCLC) {
            allowedTokens[CLC_TOKEN] = true;
            emit TokenAllowanceUpdated(CLC_TOKEN, true);
        }
    }

    receive() external payable {
        revert("Native tokens are not accepted");
    }

    fallback() external payable {
        revert("Only allowed ERC20 tokens are accepted");
    }

    function depositToken(address token, uint256 amount) external nonReentrant {
        require(allowedTokens[token], "Token not allowed");
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        donorContributions[msg.sender][token] += amount;
        totalDonorContributions[msg.sender] += amount;

        emit TokensReceived(token, msg.sender, amount);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(allowedTokens[token], "Cannot withdraw disallowed token");
        require(to != address(0), "Invalid recipient");

        IERC20(token).transfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    function balanceOf(address token) external view returns (uint256) {
        if (!allowedTokens[token]) return 0;
        return IERC20(token).balanceOf(address(this));
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