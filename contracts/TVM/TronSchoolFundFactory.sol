// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TronSchoolTokenFund.sol";
import "./TronMultiSigWallet.sol";

contract TronSchoolFundFactory is Ownable {
    mapping(string => address) public projectFunds;

    address[] public defaultAllowedTokens;

    // آدرس رسمی USDT TRC-20 روی Tron Mainnet
    //address public constant USDT_TOKEN = 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C;
    //address public constant USDT_TOKEN = 0xeca9bc828a3005b9a3b909f2cc5c2a54794de05f;
    address public constant USDT_TOKEN = 0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F;

    event FundCreated(
        string indexed projectId,
        address indexed fundAddress,
        address indexed ownerOrMultisig,
        bool isMultisig,
        uint256 requiredConfirmations
    );

    constructor(address[] memory _defaultAllowedTokens) {
        defaultAllowedTokens = _defaultAllowedTokens;

        // اطمینان از اینکه USDT همیشه در لیست پیش‌فرض باشد
        bool usdtAdded = false;
        for (uint i = 0; i < _defaultAllowedTokens.length; i++) {
            if (_defaultAllowedTokens[i] == USDT_TOKEN) {
                usdtAdded = true;
                break;
            }
        }
        if (!usdtAdded) {
            //defaultAllowedTokens.push(0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C); // USDT Nile testnet
            //defaultAllowedTokens.push(0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F);
            defaultAllowedTokens.push(USDT_TOKEN);
        }
    }

    function createSingleOwnerFund(
        string memory projectId,
        address singleOwner
    ) external onlyOwner returns (address fundAddress) {
        require(projectFunds[projectId] == address(0), "Fund already exists");
        require(singleOwner != address(0), "Invalid owner");

        TronSchoolTokenFund fund = new TronSchoolTokenFund(defaultAllowedTokens);
        fund.transferOwnership(singleOwner);

        projectFunds[projectId] = address(fund);
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
        require(
            requiredConfirmations > 0 && requiredConfirmations <= multisigOwners.length,
            "Invalid required confirmations"
        );

        TronMultiSigWallet multisig = new TronMultiSigWallet(multisigOwners, requiredConfirmations);

        TronSchoolTokenFund fund = new TronSchoolTokenFund(defaultAllowedTokens);
        fund.transferOwnership(address(multisig));

        projectFunds[projectId] = address(fund);
        emit FundCreated(projectId, address(fund), address(multisig), true, requiredConfirmations);

        return (address(fund), address(multisig));
    }

    function getFundAddress(string memory projectId) external view returns (address) {
        return projectFunds[projectId];
    }

    function updateDefaultAllowedTokens(address[] memory newTokens) external onlyOwner {
        defaultAllowedTokens = newTokens;
    }
}
