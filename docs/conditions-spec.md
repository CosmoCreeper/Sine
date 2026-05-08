# The Conditional Behavior Spec

> Please excuse that this markdown file looks messy. I threw it together a while ago, originally as a txt file, and quickly turned it into a markdown file to be hosted on the Sine repo.

This a spec for the upcoming and new conditional behavior to replace the current, messy behavior.

`sine.pref` evalutes to true or false. A pref set to an empty string is false, a false boolean is false, 0 is false, and everything else is true.

`!sine.pref` will invert whatever boolean the pref was evaluated to. So if it was evaluated to false, the result would be true.

A pref may be contained inside of single quotes if wanted but it will only be required if the pref has spaces.
`sine.pref` will work.
`sine.my pref & other.my pref` will not work and in that case you will need `'sine.my pref'`

If you want to check if a pref is equal to a string rather than if it evaluates to true or false, then you can do this
`sine.pref = large`
because the conditional language doesn't have variable assignment, single equal signs are allowed and are the only method of using them.

Now what if you want to see if it's not equal to the string large? Use `sine.pref != large`. This will essentially invert the condition.

Now let's say that you have a pref value that contains spaces and you want to see if your pref has that value, then you will need to wrap it in single quotes
`sine.pref = 'extra large'`
what if your pref has spaces too
`'sine.my pref' = 'extra large'`.

now let's say that you want to see if the pref is equal to an integer of 3
`sine.pref = 3`

what about -1
`sine.pref = -1`

what if you want to see if it's not equal to the integer of 3?
`sine.pref != 3`

now what if you want to see if your pref has a value greater than an integer
`sine.pref > 3`
so this will evaluate to true if sine.pref has an integer value of greater than 3.

what about greater than or equal to
`sine.pref >= 3`

what about less than
`sine.pref < 3`

what about less than or equal to
`sine.pref <= 3`

now what if you want to check if two conditions are both evaluated to true? you can just use the & symbol
`sine.pref <= 3 & other.pref = 'large'`
this will check if `sine.pref` has a value less than or equal to 3 and if `other.pref` has a value equal to large. if one of these is not the case, the entire expression is evaluted to false.

what if you want to check if one of two conditions is evaluated to true? you can use the / symbol (why /? when coming up with this simplistic conditions language we found that typing / was much easier than typing | like in other languages. we decided to go with / because we have no need to handle division)
`sine.pref <= 3 / other.pref != 'large'`
this will evaluate to true if sine.pref is less than or equal to 3 or if other.pref is not equal to large.

now what if you wanted to check if two conditions both evaluated to true and then if that dual condition or another condition was evaluated to true? you would wrap the first two in parentheses:
`(sine.pref <= 3 & other.pref = large) / onemore.pref = small`
this seems pretty self-explanatory. it evaluates whatever is in the parentheses first, then what's on the outside. you may notice that we've been wrapping non-spaced values in single quotes for style, but in this example you may recall that you don't have to do that.

so what is the order of operations if you will in the conditions language?
So we first evaluate from left-to-right, then to parentheses if we get to them.

`sine.pref = large / (other.pref = 3 & 'my.other pref' = 4 / oneother.pref = 5)`

So in this example the parser will evaluate `sine.pref = large` first. Why? The reason is because it's more simplistic on our end, that's it! This methodology doesn't affect performance horridenously at all either, so there's no real downside to it.

Now let's say that `sine.pref = large` evaluates to false, then we'll continue onwards and go to the only other thing to evaluate on the upper nest, the parentheses evaluation. So as of right now, this is what our expression looks like after evaluating the first chunk:

`false / (other.pref = 3 & 'my.other pref' = 4 / oneother.pref = 5)`

Now if that first portion (false) evaluated to true instead, then we would cancel out the entire or operation and say that it is equal to true, but since that's the case, we move onwards to the parentheses.

Inside the parentheses, we evaluate from left to right again. So we start with `other.pref = 3`, which, for the sake of this example, we'll say evaluates to true because other.pref equals 3. So then that means our parentheses evaluation looks like this right now:

`true & 'my.other pref' = 4 / oneother.pref = 5`

So now because our current chunk evaluation `true & 'my.other pref' = 4` uses an & operation and we need to make sure both equal true, we move onwards (if the first portion was evaluated to false we would evaluate the whole & operation to false, and vice versa for / operations) to `'my.other pref'`. Let's say that `'my.other pref'` equals false, this now means that this is what we have:

`true & false / oneother.pref = 5`

So because that first & operation has one true and one false (it needs both to be true), we evaluate it to false, meaning we now have:

`false / oneother.pref = 5`

So now we know the first one is evaluated to false, but because this is an / operation, we are sparing and move on to the next one to see if it is more hopeful (recall that if the first portion was evaluated to true, we would have evaluated the whole thing to true early on). So now for the sake of this example, let's say that `oneother.pref` is equal to 5. That means that this is what we have:

`false / true`

Which evaluates to true! So now let's return to our original expression:

`false / (other.pref = 3 & 'my.other pref' = 4 / oneother.pref = 5)`

This expression now becomes:

`false / true`

Which also evaluates to true! Meaning our final evaluation is true! Hopefully this gives you more understanding of how the conditional language in Sine works.
