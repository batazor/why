# Glossary

One meaning per word inside this context. The code, the events, the API and the
person on the call all spell it the same way.

## "Payment" in three departments

| Department | What it calls a payment | What it is called here |
| --- | --- | --- |
| Product | The purchase went through, the customer saw the checkmark | An order event. Not here |
| Processing | The money is held, nothing was captured | **Authorization** |
| Finance | The money showed up in a statement two days later | **Settlement** |

## Words

**Authorization.** The issuer agreed to hold the amount. No money moved, and the
hold expires on its own.

**Capture.** The instruction to take what was held. From here on the money has
left the payer's account.

**Settlement.** The money reached our account, and the provider's statement says
so. It arrives days later, and it may not arrive at all.

**Payment.** One attempt to collect money for one order, with a lifecycle of its
own: authorized, captured, refunded. The word means this and nothing else.

## Words that are not here

**Purchase.** A product event: the customer saw the checkmark. It lives with
orders, and there is nothing for it to mean here.
