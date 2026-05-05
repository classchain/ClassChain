// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TronMultiSigWallet {
    event Deposit(address indexed sender, uint amount, uint balance);
    event SubmitTransaction(
        address indexed owner,
        uint indexed txIndex,
        address indexed to,
        uint value,
        bytes data
    );
    event ConfirmTransaction(address indexed owner, uint indexed txIndex);
    event ExecuteTransaction(address indexed owner, uint indexed txIndex);
    event RevokeConfirmation(address indexed owner, uint indexed txIndex);

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint public numConfirmationsRequired;

    struct Transaction {
        address to;
        uint value;
        bytes data;
        bool executed;
        uint numConfirmations;
    }

    Transaction[] public transactions;
    mapping(uint => mapping(address => bool)) public isConfirmed;
    
    // اضافه شده برای محافظت در برابر حملات reentrancy
    bool private _locked;

    modifier onlyOwner() {
        require(isOwner[msg.sender], "not owner");
        _;
    }

    modifier txExists(uint _txIndex) {
        require(_txIndex < transactions.length, "tx does not exist");
        _;
    }

    modifier notExecuted(uint _txIndex) {
        require(!transactions[_txIndex].executed, "tx already executed");
        _;
    }

    modifier notConfirmed(uint _txIndex) {
        require(!isConfirmed[_txIndex][msg.sender], "tx already confirmed");
        _;
    }
    
    // اضافه شده برای جلوگیری از reentrancy
    modifier noReentrancy() {
        require(!_locked, "Reentrancy guard");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address[] memory _owners, uint _numConfirmationsRequired) {
        require(_owners.length > 0, "owners required");
        require(
            _numConfirmationsRequired > 0 && _numConfirmationsRequired <= _owners.length,
            "invalid number of required confirmations"
        );

        for (uint i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        numConfirmationsRequired = _numConfirmationsRequired;
        _locked = false;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    function submitTransaction(address _to, uint _value, bytes memory _data) public onlyOwner {
        require(_to != address(0), "invalid recipient");
        
        uint txIndex = transactions.length;

        transactions.push(
            Transaction({
                to: _to,
                value: _value,
                data: _data,
                executed: false,
                numConfirmations: 0
            })
        );

        emit SubmitTransaction(msg.sender, txIndex, _to, _value, _data);
        
        // اگر فقط یک مالک وجود داره، خودکار تایید کن
        if (owners.length == 1 && numConfirmationsRequired == 1) {
            confirmTransaction(txIndex);
        }
    }

    function confirmTransaction(uint _txIndex)
        public
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
        notConfirmed(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];
        transaction.numConfirmations += 1;
        isConfirmed[_txIndex][msg.sender] = true;

        emit ConfirmTransaction(msg.sender, _txIndex);

        if (transaction.numConfirmations >= numConfirmationsRequired) {
            executeTransaction(_txIndex);
        }
    }
    
    // اضافه شده: امکان لغو تایید قبلی
    function revokeConfirmation(uint _txIndex)
        public
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        require(isConfirmed[_txIndex][msg.sender], "tx not confirmed");
        
        Transaction storage transaction = transactions[_txIndex];
        require(transaction.numConfirmations > 0, "no confirmations to revoke");
        
        transaction.numConfirmations -= 1;
        isConfirmed[_txIndex][msg.sender] = false;
        
        emit RevokeConfirmation(msg.sender, _txIndex);
    }

    function executeTransaction(uint _txIndex)
        public
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
        noReentrancy
    {
        Transaction storage transaction = transactions[_txIndex];

        require(
            transaction.numConfirmations >= numConfirmationsRequired,
            "cannot execute tx: insufficient confirmations"
        );

        transaction.executed = true;

        // استفاده از low-level call با مدیریت بهتر خطا
        (bool success, bytes memory returnData) = transaction.to.call{value: transaction.value, gas: gasleft() - 5000}(transaction.data);
        
        if (!success) {
            // اگر خطا رخ داد، transaction.executed رو برگردون به false
            transaction.executed = false;
            
            // تلاش برای استخراج پیام خطا
            if (returnData.length > 0) {
                assembly {
                    let returnData_size := mload(returnData)
                    revert(add(32, returnData), returnData_size)
                }
            } else {
                revert("tx failed with no error message");
            }
        }

        emit ExecuteTransaction(msg.sender, _txIndex);
    }

    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() public view returns (uint) {
        return transactions.length;
    }
    
    // اضافه شده: دریافت تعداد تراکنش‌های تایید نشده
    function getPendingTransactionCount() public view returns (uint) {
        uint count = 0;
        for (uint i = 0; i < transactions.length; i++) {
            if (!transactions[i].executed) {
                count++;
            }
        }
        return count;
    }

    function getTransaction(uint _txIndex)
        public
        view
        returns (
            address to,
            uint value,
            bytes memory data,
            bool executed,
            uint numConfirmations
        )
    {
        require(_txIndex < transactions.length, "tx does not exist");
        Transaction storage transaction = transactions[_txIndex];

        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.numConfirmations
        );
    }
    
    // اضافه شده: دریافت تاییدکننده‌های یک تراکنش
    function getConfirmations(uint _txIndex) public view returns (address[] memory) {
        require(_txIndex < transactions.length, "tx does not exist");
        
        address[] memory confirmers = new address[](owners.length);
        uint count = 0;
        
        for (uint i = 0; i < owners.length; i++) {
            address owner = owners[i];
            if (isConfirmed[_txIndex][owner]) {
                confirmers[count] = owner;
                count++;
            }
        }
        
        // تغییر سایز آرایه به تعداد واقعی
        address[] memory result = new address[](count);
        for (uint i = 0; i < count; i++) {
            result[i] = confirmers[i];
        }
        
        return result;
    }
}
